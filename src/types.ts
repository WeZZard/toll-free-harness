export type HookEventKind =
  | "pre_tool_use"
  | "permission_request"
  | "post_tool_use"
  | "user_prompt_submit"
  | "stop";

export interface HookEvent {
  kind: HookEventKind;
  toolName?: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

export interface HookRequest {
  hookEventName: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export type HookResponse = Record<string, unknown>;

export type HookHandler = (request: HookRequest) => Promise<HookResponse>;

export interface SessionConfig {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  prompt: string;
  bin?: string;
  cols?: number;
  rows?: number;
  hookScriptDir?: string;
}

export interface SessionResult {
  exitCode: number;
  signal: number;
}

export interface ExpectedEvent {
  kind: HookEventKind;
  toolName?: string;
}
