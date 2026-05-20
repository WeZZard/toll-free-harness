import type { RecordedEvent, SessionRecording } from "./types.js";
import type {
  SessionConfig,
  SessionResult,
  AskUserQuestionHandler,
  ExitPlanModeHandler,
} from "../claude_code/types.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export class SessionRecorder {
  private events: RecordedEvent[] = [];
  private startTime = 0;
  private _result: SessionResult | null = null;

  constructor(private outputPath: string) {}

  private ts(): number {
    return Date.now() - this.startTime;
  }

  start(): void {
    this.startTime = Date.now();
    this.events = [];
    this._result = null;
  }

  wrapAskUserQuestion(handler: AskUserQuestionHandler): AskUserQuestionHandler {
    return async (event) => {
      const payload: Record<string, unknown> = { ...event.payload };
      payload.text = event.text;
      payload.questions = event.questions;
      this.events.push({
        ts: this.ts(),
        kind: "hook_event",
        hookEventName: "PreToolUse",
        toolName: "AskUserQuestion",
        payload,
      });
      const answer = await handler(event);
      this.events.push({
        ts: this.ts(),
        kind: "pty_in",
        data: JSON.stringify(answer),
      });
      return answer;
    };
  }

  wrapExitPlanMode(handler: ExitPlanModeHandler): ExitPlanModeHandler {
    return async (event) => {
      const payload: Record<string, unknown> = { ...event.payload };
      payload.planText = event.planText;
      payload.planFilePath = event.planFilePath;
      this.events.push({
        ts: this.ts(),
        kind: "hook_event",
        hookEventName: "PreToolUse",
        toolName: "ExitPlanMode",
        payload,
      });
      const decision = await handler(event);
      this.events.push({
        ts: this.ts(),
        kind: "pty_in",
        data: JSON.stringify(decision),
      });
      return decision;
    };
  }

  recordResult(result: SessionResult): void {
    this._result = result;
  }

  async save(config: SessionConfig): Promise<void> {
    if (this._result === null) {
      throw new Error("SessionRecorder: recordResult() must be called before save()");
    }
    const recording: SessionRecording = {
      config,
      events: this.events,
      result: this._result,
    };
    await mkdir(path.dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, JSON.stringify(recording, null, 2), "utf8");
  }
}
