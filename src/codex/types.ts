export interface CodexThreadConfig {
  model?: string;
  cwd?: string;
  approvalPolicy?: "never" | "unlessTrusted" | "on-request";
  sandbox?: "readOnly" | "workspaceWrite" | "dangerFullAccess";
  bin?: string;
}

export interface ApprovalRequest {
  itemId: string;
  threadId: string;
  turnId: string;
  kind: "commandExecution" | "fileChange";
  command?: string;
  reason?: string;
  payload: Record<string, unknown>;
}

export type ApprovalDecision =
  | { accept: true }
  | { acceptForSession: true }
  | { decline: true }
  | { cancel: true };

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalDecision>;
export type NotificationHandler = (params: Record<string, unknown>) => void;

export interface CodexTurnResult {
  status: "completed" | "interrupted" | "failed";
  items: Array<Record<string, unknown>>;
}
