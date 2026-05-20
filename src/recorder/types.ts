import type { SessionConfig, SessionResult } from "../claude_code/types.js";

export type RecordedEvent =
  | { ts: number; kind: "hook_event"; hookEventName: string; toolName?: string; payload: Record<string, unknown> }
  | { ts: number; kind: "pty_out"; data: string }
  | { ts: number; kind: "pty_in"; data: string };

export interface SessionRecording {
  config: SessionConfig;
  events: RecordedEvent[];
  result: SessionResult;
}
