export { EventSequenceGuardrail, GuardrailTimeoutError } from "./core/guardrail.js";
export type { HookEvent, HookEventKind, ExpectedEvent } from "./core/types.js";

export { ClaudeCodeSession } from "./claude_code/session.js";
export { HookServer } from "./claude_code/hook_server.js";
export { writeHookSettings } from "./claude_code/hook_settings.js";
export type {
  HookRequest,
  HookListener,
  SessionConfig,
  SessionResult,
  SendPromptOptions,
  AskUserQuestionEvent,
  QuestionAnswer,
  QuestionSpec,
  QuestionOption,
  ExitPlanModeEvent,
  PlanDecision,
  AskUserQuestionHandler,
  ExitPlanModeHandler,
} from "./claude_code/types.js";

export { SessionRecorder } from "./recorder/recorder.js";
export { SessionPlayer } from "./recorder/player.js";
export type { RecordedEvent, SessionRecording } from "./recorder/types.js";
