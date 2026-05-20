import * as pty from "node-pty";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type {
  SessionConfig,
  SessionResult,
  HookListener,
  HookRequest,
} from "./types.js";
import { HookServer } from "./hook_server.js";
import { writeHookSettings } from "./hook_settings.js";
import { EventSequenceGuardrail } from "../core/guardrail.js";

export class ClaudeCodeSession {
  private ptyProcess: pty.IPty | undefined;
  private hookServer: HookServer;
  private _guardrail: EventSequenceGuardrail;

  private listeners: {
    preToolUse: Map<string, HookListener>;
    permissionRequest: Map<string, HookListener>;
    postToolUse: Map<string, HookListener>;
    stop: Array<(payload: Record<string, unknown>) => Promise<void> | void>;
    userPromptSubmit: Array<(payload: Record<string, unknown>) => Promise<void> | void>;
  };

  constructor(readonly config: SessionConfig) {
    this.hookServer = new HookServer();
    this._guardrail = new EventSequenceGuardrail();
    this.listeners = {
      preToolUse: new Map(),
      permissionRequest: new Map(),
      postToolUse: new Map(),
      stop: [],
      userPromptSubmit: [],
    };
  }

  onPreToolUse(toolName: string, listener: HookListener): this {
    this.listeners.preToolUse.set(toolName, listener);
    return this;
  }

  onPermissionRequest(toolName: string, listener: HookListener): this {
    this.listeners.permissionRequest.set(toolName, listener);
    return this;
  }

  onPostToolUse(toolName: string, listener: HookListener): this {
    this.listeners.postToolUse.set(toolName, listener);
    return this;
  }

  onStop(listener: (payload: Record<string, unknown>) => Promise<void> | void): this {
    this.listeners.stop.push(listener);
    return this;
  }

  onUserPromptSubmit(listener: (payload: Record<string, unknown>) => Promise<void> | void): this {
    this.listeners.userPromptSubmit.push(listener);
    return this;
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  get guardrail(): EventSequenceGuardrail {
    return this._guardrail;
  }

  async run(): Promise<SessionResult> {
    const homeDir = this.config.env?.HOME ?? process.env.HOME ?? "/tmp";
    const socketPath = path.join(os.tmpdir(), `toll-free-${randomUUID()}.sock`);

    await this.hookServer.start(socketPath);

    this.hookServer.setEventListener((event) => {
      this._guardrail.push(event);
    });

    this.hookServer.setHandler("PreToolUse", async (req: HookRequest) => {
      const listener =
        this.listeners.preToolUse.get(req.toolName ?? "") ??
        this.listeners.preToolUse.get("*");
      if (listener) await listener(req);
      return {};
    });

    this.hookServer.setHandler("PermissionRequest", async (req: HookRequest) => {
      const listener =
        this.listeners.permissionRequest.get(req.toolName ?? "") ??
        this.listeners.permissionRequest.get("*");
      if (listener) await listener(req);
      return {};
    });

    this.hookServer.setHandler("PostToolUse", async (req: HookRequest) => {
      const listener =
        this.listeners.postToolUse.get(req.toolName ?? "") ??
        this.listeners.postToolUse.get("*");
      if (listener) await listener(req);
      return {};
    });

    this.hookServer.setHandler("Stop", async (req: HookRequest) => {
      for (const listener of this.listeners.stop) {
        await listener(req.payload);
      }
      return {};
    });

    this.hookServer.setHandler("UserPromptSubmit", async (req: HookRequest) => {
      for (const listener of this.listeners.userPromptSubmit) {
        await listener(req.payload);
      }
      return {};
    });

    await writeHookSettings(homeDir, { socketPath });

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (this.config.env) {
      Object.assign(env, this.config.env);
    }

    this.ptyProcess = pty.spawn(
      this.config.bin ?? "claude",
      [...this.config.args, this.config.prompt],
      {
        name: "xterm-256color",
        cols: this.config.cols ?? 120,
        rows: this.config.rows ?? 40,
        cwd: this.config.cwd,
        env,
      },
    );

    try {
      return await new Promise<SessionResult>((resolve) => {
        this.ptyProcess!.onExit(({ exitCode, signal }) => {
          resolve({ exitCode, signal: signal ?? 0 });
        });
      });
    } finally {
      this._guardrail.dispose();
      await this.hookServer.stop();
    }
  }

  stop(): void {
    this.ptyProcess?.kill();
  }
}
