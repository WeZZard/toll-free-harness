import type { SessionRecording } from "./types.js";
import type {
  AskUserQuestionHandler,
  ExitPlanModeHandler,
  HookListener,
  SessionResult,
  AskUserQuestionEvent,
  ExitPlanModeEvent,
  SendPromptOptions,
} from "../claude_code/types.js";
import type { HookEvent, HookEventKind } from "../core/types.js";
import { EventSequenceGuardrail } from "../core/guardrail.js";
import { readFile } from "node:fs/promises";

function mapKind(hookEventName: string): HookEventKind {
  switch (hookEventName) {
    case "PreToolUse":
      return "pre_tool_use";
    case "PostToolUse":
      return "post_tool_use";
    case "PermissionRequest":
      return "permission_request";
    case "UserPromptSubmit":
      return "user_prompt_submit";
    case "Stop":
      return "stop";
    default:
      return "pre_tool_use";
  }
}

export class SessionPlayer {
  private recording: SessionRecording | null = null;
  private askHandler: AskUserQuestionHandler | null = null;
  private planHandler: ExitPlanModeHandler | null = null;
  private stopListeners: Array<(payload: Record<string, unknown>) => Promise<void> | void> = [];
  private _guardrail = new EventSequenceGuardrail();

  constructor(private recordingPath: string) {}

  async load(): Promise<void> {
    const data = await readFile(this.recordingPath, "utf8");
    this.recording = JSON.parse(data) as SessionRecording;
  }

  onAskUserQuestion(handler: AskUserQuestionHandler): this {
    this.askHandler = handler;
    return this;
  }

  onExitPlanMode(handler: ExitPlanModeHandler): this {
    this.planHandler = handler;
    return this;
  }

  onPreToolUse(_toolName: string, _listener: HookListener): this {
    return this;
  }

  onPostToolUse(_toolName: string, _listener: HookListener): this {
    return this;
  }

  onPermissionRequest(_toolName: string, _listener: HookListener): this {
    return this;
  }

  onStop(listener: (payload: Record<string, unknown>) => Promise<void> | void): this {
    this.stopListeners.push(listener);
    return this;
  }

  onUserPromptSubmit(
    _listener: (payload: Record<string, unknown>) => Promise<void> | void,
  ): this {
    return this;
  }

  sendPrompt(_text: string, _options?: SendPromptOptions): void {
    // No-op during replay
  }

  get guardrail(): EventSequenceGuardrail {
    return this._guardrail;
  }

  stop(): void {
    // No-op during replay
  }

  async run(): Promise<SessionResult> {
    if (this.recording === null) {
      await this.load();
    }

    const recording = this.recording!;

    for (const event of recording.events) {
      if (event.kind === "hook_event") {
        const hookEvent: HookEvent = {
          kind: mapKind(event.hookEventName),
          payload: event.payload,
          receivedAt: Date.now(),
        };
        if (event.toolName !== undefined) {
          hookEvent.toolName = event.toolName;
        }
        this._guardrail.push(hookEvent);

        if (event.toolName === "AskUserQuestion" && this.askHandler !== null) {
          const questions = Array.isArray(event.payload.questions)
            ? (event.payload.questions as Array<Record<string, unknown>>).map((q) => ({
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
          const askEvent: AskUserQuestionEvent = {
            text: String(event.payload.text ?? ""),
            questions,
            payload: event.payload,
          };
          await this.askHandler(askEvent);
        }

        if (event.toolName === "ExitPlanMode" && this.planHandler !== null) {
          const planEvent: ExitPlanModeEvent = {
            planText: String(event.payload.planText ?? ""),
            planFilePath: String(event.payload.planFilePath ?? ""),
            payload: event.payload,
          };
          await this.planHandler(planEvent);
        }
      }
    }

    for (const listener of this.stopListeners) {
      await listener({});
    }

    this._guardrail.dispose();
    return recording.result;
  }
}
