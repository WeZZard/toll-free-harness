import { ClaudeCodeSession } from "../../src/claude_code/session.js";
import { SessionRecorder } from "../../src/recorder/recorder.js";
import { SessionPlayer } from "../../src/recorder/player.js";
import type {
  SessionConfig,
  SessionResult,
  AskUserQuestionHandler,
  ExitPlanModeHandler,
  HookListener,
  SendPromptOptions,
} from "../../src/claude_code/types.js";
import type { EventSequenceGuardrail } from "../../src/core/guardrail.js";
import path from "node:path";
import os from "node:os";
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INTEGRATION = process.env.TOLL_FREE_INTEGRATION === "1";
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "recordings");
const GENERATED_DIR = path.join(__dirname, "..", "fixtures", "generated");

export function isIntegration(): boolean {
  return INTEGRATION;
}

export function fixturesDir(): string {
  return FIXTURES_DIR;
}

export function generatedDir(): string {
  return GENERATED_DIR;
}

export function createIsolatedHome(): string {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "tfh-test-"));
  const claudeDir = path.join(tmpHome, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    path.join(tmpHome, ".claude.json"),
    "{}",
    "utf8",
  );
  writeFileSync(
    path.join(claudeDir, "settings.json"),
    JSON.stringify({ enabledPlugins: {} }),
    "utf8",
  );
  const realKeychains = path.join(os.homedir(), "Library", "Keychains");
  if (existsSync(realKeychains)) {
    mkdirSync(path.join(tmpHome, "Library"), { recursive: true });
    symlinkSync(realKeychains, path.join(tmpHome, "Library", "Keychains"));
  }
  const realAppSupport = path.join(os.homedir(), "Library", "Application Support", "Claude");
  if (existsSync(realAppSupport)) {
    mkdirSync(path.join(tmpHome, "Library", "Application Support"), { recursive: true });
    symlinkSync(realAppSupport, path.join(tmpHome, "Library", "Application Support", "Claude"));
  }
  const realClaudeJson = path.join(os.homedir(), ".claude.json");
  if (existsSync(realClaudeJson)) {
    symlinkSync(realClaudeJson, path.join(tmpHome, ".claude.json.real"));
  }
  const realEncKey = path.join(os.homedir(), ".claude", ".encryption_key");
  if (existsSync(realEncKey)) {
    symlinkSync(realEncKey, path.join(claudeDir, ".encryption_key"));
  }
  const realCreds = path.join(os.homedir(), ".claude", "credentials.json");
  if (existsSync(realCreds)) {
    symlinkSync(realCreds, path.join(claudeDir, "credentials.json"));
  }
  return tmpHome;
}

export interface TestSession {
  onAskUserQuestion(handler: AskUserQuestionHandler): this;
  onExitPlanMode(handler: ExitPlanModeHandler): this;
  onPreToolUse(toolName: string, listener: HookListener): this;
  onPostToolUse(toolName: string, listener: HookListener): this;
  onPermissionRequest(toolName: string, listener: HookListener): this;
  onStop(listener: (payload: Record<string, unknown>) => Promise<void> | void): this;
  onUserPromptSubmit(listener: (payload: Record<string, unknown>) => Promise<void> | void): this;
  sendPrompt(text: string, options?: SendPromptOptions): void;
  run(): Promise<SessionResult>;
  stop(): void;
  guardrail: EventSequenceGuardrail;
}

export function fixturePath(testName: string): string {
  return path.join(FIXTURES_DIR, `${testName}.json`);
}

export function hasFixture(testName: string): boolean {
  return existsSync(fixturePath(testName));
}

export async function createTestSession(
  testName: string,
  config: SessionConfig,
): Promise<TestSession> {
  const fp = fixturePath(testName);

  if (INTEGRATION) {
    const session = new ClaudeCodeSession(config);
    const recorder = new SessionRecorder(fp);
    recorder.start();
    return createRecordingSession(session, recorder, config);
  }

  if (!existsSync(fp)) {
    throw new Error(
      `No recording fixture found at ${fp}. Run with TOLL_FREE_INTEGRATION=1 first.`,
    );
  }
  const player = new SessionPlayer(fp);
  await player.load();
  return player as unknown as TestSession;
}

function createRecordingSession(
  session: ClaudeCodeSession,
  recorder: SessionRecorder,
  config: SessionConfig,
): TestSession {
  const wrapper: TestSession = {
    onAskUserQuestion(handler: AskUserQuestionHandler) {
      session.onAskUserQuestion(recorder.wrapAskUserQuestion(handler));
      return wrapper;
    },
    onExitPlanMode(handler: ExitPlanModeHandler) {
      session.onExitPlanMode(recorder.wrapExitPlanMode(handler));
      return wrapper;
    },
    onPreToolUse(name: string, listener: HookListener) {
      session.onPreToolUse(name, listener);
      return wrapper;
    },
    onPostToolUse(name: string, listener: HookListener) {
      session.onPostToolUse(name, listener);
      return wrapper;
    },
    onPermissionRequest(name: string, listener: HookListener) {
      session.onPermissionRequest(name, listener);
      return wrapper;
    },
    onStop(listener: (payload: Record<string, unknown>) => Promise<void> | void) {
      session.onStop(listener);
      return wrapper;
    },
    onUserPromptSubmit(listener: (payload: Record<string, unknown>) => Promise<void> | void) {
      session.onUserPromptSubmit(listener);
      return wrapper;
    },
    sendPrompt(text: string, options?: SendPromptOptions) {
      session.sendPrompt(text, options);
    },
    async run() {
      const result = await session.run();
      recorder.recordResult(result);
      await recorder.save(config);
      return result;
    },
    stop() {
      session.stop();
    },
    get guardrail() {
      return session.guardrail;
    },
  };
  return wrapper;
}
