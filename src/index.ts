export { EventSequenceGuardrail, GuardrailTimeoutError } from "./core/guardrail.js";
export type { HookEvent, HookEventKind, ExpectedEvent } from "./core/types.js";

export { ClaudeCodeSession } from "./claude_code/session.js";
export { HookServer } from "./claude_code/hook_server.js";
export { writeHookSettings } from "./claude_code/hook_settings.js";
export {
  selectOptionByNumber,
  approveExitPlanMode,
  rejectExitPlanMode,
  typeMessage,
} from "./claude_code/keystroke.js";
export type {
  HookRequest,
  HookResponse,
  HookHandler,
  SessionConfig,
  SessionResult,
  HookSettingsConfig,
} from "./claude_code/types.js";

export { CodexSession } from "./codex/session.js";
export { JsonRpcTransport, JsonRpcTransportError } from "./codex/protocol.js";
export type {
  CodexThreadConfig,
  CodexTurnResult,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalHandler,
  NotificationHandler,
} from "./codex/types.js";
