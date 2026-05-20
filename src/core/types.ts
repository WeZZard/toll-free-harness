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

export interface ExpectedEvent {
  kind: HookEventKind;
  toolName?: string;
}
