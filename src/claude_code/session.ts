import * as pty from "node-pty";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type {
  SessionConfig,
  SessionResult,
  HookHandler,
  HookRequest,
  HookResponse,
} from "./types.js";
import { HookServer } from "./hook_server.js";
import { writeHookSettings } from "./hook_settings.js";
import { EventSequenceGuardrail } from "../core/guardrail.js";

export class ClaudeCodeSession {
  private ptyProcess: pty.IPty | undefined;
  private hookServer: HookServer;
  private _guardrail: EventSequenceGuardrail;

  private handlers: {
    preToolUse: Map<string, HookHandler>;
    permissionRequest: Map<string, HookHandler>;
    postToolUse: Map<string, HookHandler>;
    stop: Array<(payload: Record<string, unknown>) => Promise<void>>;
    userPromptSubmit: Array<(payload: Record<string, unknown>) => Promise<void>>;
  };

  constructor(readonly config: SessionConfig) {
    this.hookServer = new HookServer();
    this._guardrail = new EventSequenceGuardrail();
    this.handlers = {
      preToolUse: new Map(),
      permissionRequest: new Map(),
      postToolUse: new Map(),
      stop: [],
      userPromptSubmit: [],
    };
  }

  onPreToolUse(toolName: string, handler: HookHandler): this {
    this.handlers.preToolUse.set(toolName, handler);
    return this;
  }

  onPermissionRequest(toolName: string, handler: HookHandler): this {
    this.handlers.permissionRequest.set(toolName, handler);
    return this;
  }

  onPostToolUse(toolName: string, handler: HookHandler): this {
    this.handlers.postToolUse.set(toolName, handler);
    return this;
  }

  onStop(handler: (payload: Record<string, unknown>) => Promise<void>): this {
    this.handlers.stop.push(handler);
    return this;
  }

  onUserPromptSubmit(handler: (payload: Record<string, unknown>) => Promise<void>): this {
    this.handlers.userPromptSubmit.push(handler);
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

    this.hookServer.setHandler("PreToolUse", async (req: HookRequest): Promise<HookResponse> => {
      const handler =
        this.handlers.preToolUse.get(req.toolName ?? "") ??
        this.handlers.preToolUse.get("*");
      if (handler) {
        return handler(req);
      }
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
        },
      };
    });

    this.hookServer.setHandler("PermissionRequest", async (req: HookRequest): Promise<HookResponse> => {
      const handler =
        this.handlers.permissionRequest.get(req.toolName ?? "") ??
        this.handlers.permissionRequest.get("*");
      if (handler) {
        return handler(req);
      }
      return {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "allow" },
        },
      };
    });

    this.hookServer.setHandler("PostToolUse", async (req: HookRequest): Promise<HookResponse> => {
      const handler =
        this.handlers.postToolUse.get(req.toolName ?? "") ??
        this.handlers.postToolUse.get("*");
      if (handler) {
        return handler(req);
      }
      return {};
    });

    this.hookServer.setHandler("Stop", async (req: HookRequest): Promise<HookResponse> => {
      for (const handler of this.handlers.stop) {
        await handler(req.payload);
      }
      return {};
    });

    this.hookServer.setHandler("UserPromptSubmit", async (req: HookRequest): Promise<HookResponse> => {
      for (const handler of this.handlers.userPromptSubmit) {
        await handler(req.payload);
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
