export interface HookRequest {
  hookEventName: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export type HookListener = (request: HookRequest) => Promise<void> | void;

export interface SessionConfig {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  prompt: string;
  bin?: string;
  cols?: number;
  rows?: number;
}

export interface SessionResult {
  exitCode: number;
  signal: number;
}

export interface HookSettingsConfig {
  socketPath: string;
}

// === Dedicated interaction types ===

export interface SendPromptOptions {
  images?: string[];
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionSpec {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionEvent {
  text: string;
  questions: QuestionSpec[];
  payload: Record<string, unknown>;
}

export interface QuestionAnswer {
  selectedIndex: number;
}

export interface ExitPlanModeEvent {
  planText: string;
  planFilePath: string;
  payload: Record<string, unknown>;
}

export type PlanDecision =
  | { decision: "approve" }
  | { decision: "reject"; feedback: string };

export type AskUserQuestionHandler = (event: AskUserQuestionEvent) => Promise<QuestionAnswer>;
export type ExitPlanModeHandler = (event: ExitPlanModeEvent) => Promise<PlanDecision>;
