import * as pty from "node-pty";
import path from "node:path";
import os from "node:os";
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

    // PreToolUse: dedicated handlers for AskUserQuestion/ExitPlanMode + user listeners
    this.hookServer.setHandler("PreToolUse", async (req: HookRequest) => {
      // Handle AskUserQuestion via dedicated handler
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

      // Handle ExitPlanMode via dedicated handler
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

      // Call user's read-only listeners
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

    this.plugin = await generatePlugin(socketPath);

    // Auto-inject survey suppression, then overlay user-provided env
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = "1";
    if (this.config.env) {
      Object.assign(env, this.config.env);
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

    // Auto-accept workspace trust dialog and onboarding theme picker.
    // PTY output contains ANSI escapes between words, so match on
    // short contiguous fragments rather than full phrases.
    let trustAccepted = false;
    let themeAccepted = false;
    this.ptyProcess.onData((data: string) => {
      if (!trustAccepted && data.includes("trust")) {
        trustAccepted = true;
        this.ptyProcess?.write("\r");
      }
      if (!themeAccepted && data.includes("text style")) {
        themeAccepted = true;
        this.ptyProcess?.write("1");
      }
    });

    try {
      return await new Promise<SessionResult>((resolve) => {
        this.ptyProcess!.onExit(({ exitCode, signal }) => {
          resolve({ exitCode, signal: signal ?? 0 });
        });
      });
    } finally {
      this._guardrail.dispose();
      await this.hookServer.stop();
      await this.plugin?.cleanup();
    }
  }

  stop(): void {
    this.ptyProcess?.kill();
  }
}
