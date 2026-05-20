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
