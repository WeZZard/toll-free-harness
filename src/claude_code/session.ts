import * as pty from "node-pty";
import path from "node:path";
import os from "node:os";
import { createWriteStream, type WriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  SessionConfig,
  SessionResult,
  HookListener,
  HookRequest,
  AskUserQuestionEvent,
  QuestionAnswer,
  AskUserQuestionHandler,
  ExitPlanModeEvent,
  PlanDecision,
  ExitPlanModeHandler,
  SendPromptOptions,
} from "./types.js";
import { HookServer } from "./hook_server.js";
import { generatePlugin, type GeneratedPlugin } from "./plugin_generator.js";
import { EventSequenceGuardrail } from "../core/guardrail.js";
import { preTrust } from "./pre_trust.js";
import { DialogGuard } from "./dialog_guard.js";
import {
  selectOptionByNumber,
  navigateAndSelect,
  approveExitPlanMode,
  pressEscape,
  typeMessage,
} from "./keystroke.js";

export class ClaudeCodeSession {
  private ptyProcess: pty.IPty | undefined;
  private hookServer: HookServer;
  private _guardrail: EventSequenceGuardrail;
  private plugin: GeneratedPlugin | undefined;
  private dialogGuard: DialogGuard;

  // Dedicated interaction handlers
  private askUserQuestionHandler: AskUserQuestionHandler | undefined;
  private exitPlanModeHandler: ExitPlanModeHandler | undefined;

  // Read-only hook listeners
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
    this.dialogGuard = new DialogGuard();
    this.listeners = {
      preToolUse: new Map(),
      permissionRequest: new Map(),
      postToolUse: new Map(),
      stop: [],
      userPromptSubmit: [],
    };
  }

  // === Dedicated interaction APIs ===

  sendPrompt(text: string, options?: SendPromptOptions): void {
    if (!this.ptyProcess) return;
    let message = text;
    if (options?.images?.length) {
      message = `${text} ${options.images.join(" ")}`;
    }
    this.ptyProcess.write(typeMessage(message));
  }

  onAskUserQuestion(handler: AskUserQuestionHandler): this {
    this.askUserQuestionHandler = handler;
    return this;
  }

  onExitPlanMode(handler: ExitPlanModeHandler): this {
    this.exitPlanModeHandler = handler;
    return this;
  }

  // === Read-only hook listeners ===

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

  get guardrail(): EventSequenceGuardrail {
    return this._guardrail;
  }

  async run(): Promise<SessionResult> {
    const socketPath = path.join(os.tmpdir(), `toll-free-${randomUUID()}.sock`);

    await this.hookServer.start(socketPath);
    console.error(`[tfh] hook server started on ${socketPath}`);

    this.hookServer.setEventListener((event) => {
      console.error(`[tfh] hook event: ${event.kind} tool=${event.toolName ?? "none"}`);
      this._guardrail.push(event);
    });

    // PreToolUse: read-only observation + user listeners
    this.hookServer.setHandler("PreToolUse", async (req: HookRequest) => {
      const listener =
        this.listeners.preToolUse.get(req.toolName ?? "") ??
        this.listeners.preToolUse.get("*");
      if (listener) await listener(req);
      return {};
    });

    // PermissionRequest: inject keystrokes here (fires when UI is rendering)
    this.hookServer.setHandler("PermissionRequest", async (req: HookRequest) => {
      if (req.toolName === "AskUserQuestion" && this.askUserQuestionHandler) {
        const toolInput = req.toolInput ?? {};
        const questions = Array.isArray(toolInput.questions)
          ? (toolInput.questions as Array<Record<string, unknown>>).map((q) => ({
              question: String(q?.question ?? ""),
              header: String(q?.header ?? ""),
              options: Array.isArray(q?.options)
                ? (q.options as Array<Record<string, unknown>>).map((o) => ({
                    label: String(o?.label ?? ""),
                    description: String(o?.description ?? ""),
                  }))
                : [],
              multiSelect: Boolean(q?.multiSelect),
            }))
          : [];
        const text = questions.map((q) => q.question).join("\n");
        const event: AskUserQuestionEvent = { text, questions, payload: req.payload };
        const answer = await this.askUserQuestionHandler(event);
        if (this.ptyProcess) {
          if (answer.selectedIndex >= 0 && answer.selectedIndex <= 8) {
            this.ptyProcess.write(selectOptionByNumber(answer.selectedIndex));
          } else {
            this.ptyProcess.write(navigateAndSelect(0, answer.selectedIndex));
          }
        }
      }

      if (req.toolName === "ExitPlanMode" && this.exitPlanModeHandler) {
        const toolInput = req.toolInput ?? {};
        const event: ExitPlanModeEvent = {
          planText: String(toolInput.plan ?? toolInput.text ?? ""),
          planFilePath: String(toolInput.planFilePath ?? ""),
          payload: req.payload,
        };
        const decision = await this.exitPlanModeHandler(event);
        if (this.ptyProcess) {
          if (decision.decision === "approve") {
            this.ptyProcess.write(approveExitPlanMode());
          } else {
            this.ptyProcess.write(pressEscape());
            this.ptyProcess.write(typeMessage(decision.feedback));
          }
        }
      }

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
      console.error(`[tfh] Stop handler fired, killing PTY`);
      for (const listener of this.listeners.stop) {
        await listener(req.payload);
      }
      this.ptyProcess?.kill();
      return {};
    });

    this.hookServer.setHandler("UserPromptSubmit", async (req: HookRequest) => {
      for (const listener of this.listeners.userPromptSubmit) {
        await listener(req.payload);
      }
      return {};
    });

    this.hookServer.setHandler("SessionStart", async () => {
      this.dialogGuard.deactivate();
      return {};
    });

    this.plugin = await generatePlugin(socketPath);

    // Auto-inject survey suppression, then overlay user-provided env
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = "1";
    if (this.config.env) {
      Object.assign(env, this.config.env);
    }

    // Pre-session dialog handling
    const isIsolatedHome = Boolean(this.config.env?.HOME);
    if (isIsolatedHome) {
      await preTrust(this.config.env!.HOME!, this.config.cwd);
    }
    // Trust + theme handlers always active — preTrust is best-effort,
    // the PTY handler is the reliable fallback
    this.dialogGuard.addHandler("trust", "\r");
    this.dialogGuard.addHandler("text style", "1");
    if (this.config.args.includes("bypassPermissions")) {
      this.dialogGuard.addHandler("accept", "2");
    }

    const spawnArgs = [
      "--plugin-dir", this.plugin.pluginDir,
      ...this.config.args,
      this.config.prompt,
    ];

    this.ptyProcess = pty.spawn(
      this.config.bin ?? "claude",
      spawnArgs,
      {
        name: "xterm-256color",
        cols: this.config.cols ?? 120,
        rows: this.config.rows ?? 40,
        cwd: this.config.cwd,
        env,
      },
    );

    // === Debug instrumentation (opt-in via TFH_PTY_DEBUG_LOG env) =============
    // When TFH_PTY_DEBUG_LOG is set, mirror every PTY byte Claude emits to that
    // file and stamp key state transitions to stderr. Diagnoses hangs that
    // would otherwise leave no trace — we see exactly what Claude was printing
    // (or not printing) and when.
    const debugLogPath = process.env.TFH_PTY_DEBUG_LOG;
    let debugStream: WriteStream | null = null;
    const t0 = Date.now();
    const stamp = (msg: string) =>
      console.error(`[tfh-debug] ${((Date.now() - t0) / 1000).toFixed(2)}s ${msg}`);
    if (debugLogPath) {
      debugStream = createWriteStream(debugLogPath, { flags: "a" });
      debugStream.write(`\n--- tfh PTY mirror ${new Date().toISOString()} pid=${this.ptyProcess.pid} ---\n`);
      console.error(`[tfh-debug] PTY mirror -> ${debugLogPath}`);
      this.ptyProcess.onData((data: string) => { debugStream!.write(data); });
    }
    stamp(`spawned claude pid=${this.ptyProcess.pid} args=${JSON.stringify(spawnArgs.slice(0, 8))}…`);
    let firstByteSeen = false;
    let lastByteAt = Date.now();
    this.ptyProcess.onData((data: string) => {
      lastByteAt = Date.now();
      if (!firstByteSeen) {
        firstByteSeen = true;
        stamp(`first PTY byte (${data.length} bytes: ${JSON.stringify(data.slice(0, 80))})`);
      }
    });
    const heartbeat = setInterval(() => {
      const idleSec = Math.round((Date.now() - lastByteAt) / 1000);
      stamp(`heartbeat: claude pid=${this.ptyProcess!.pid} alive, last PTY byte ${idleSec}s ago, firstByte=${firstByteSeen}`);
    }, 30_000);
    heartbeat.unref();
    // =========================================================================

    this.dialogGuard.attach(this.ptyProcess);

    try {
      return await new Promise<SessionResult>((resolve) => {
        this.ptyProcess!.onExit(({ exitCode, signal }) => {
          stamp(`claude exited code=${exitCode} signal=${signal ?? 0}`);
          resolve({ exitCode, signal: signal ?? 0 });
        });
      });
    } finally {
      clearInterval(heartbeat);
      debugStream?.end();
      this.dialogGuard.deactivate();
      this._guardrail.dispose();
      await this.hookServer.stop();
      await this.plugin?.cleanup();
    }
  }

  stop(): void {
    this.ptyProcess?.kill();
  }
}
