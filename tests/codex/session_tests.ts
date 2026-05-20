import { describe, test, expect, vi } from "vitest";
import { PassThrough } from "node:stream";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    stdout: new PassThrough(),
    stdin: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
    on: vi.fn(),
    pid: 12345,
  })),
}));

// Import after mocks are declared
const { CodexSession } = await import("../../src/codex/session.js");

describe("CodexSession", () => {
  test("constructor stores config", () => {
    const config = {
      model: "o3",
      cwd: "/tmp",
    };
    const session = new CodexSession(config);
    expect(session.config).toBe(config);
  });

  test("onApproval returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onApproval(async () => ({ accept: true as const }));
    expect(result).toBe(session);
  });

  test("onTurnCompleted returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onTurnCompleted(() => {});
    expect(result).toBe(session);
  });

  test("onItemStarted returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onItemStarted(() => {});
    expect(result).toBe(session);
  });

  test("onItemCompleted returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onItemCompleted(() => {});
    expect(result).toBe(session);
  });

  test("onAgentMessageDelta returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onAgentMessageDelta(() => {});
    expect(result).toBe(session);
  });

  test("onCommandOutputDelta returns this for fluent chaining", () => {
    const session = new CodexSession({});
    const result = session.onCommandOutputDelta(() => {});
    expect(result).toBe(session);
  });

  test("fluent API allows chaining multiple handlers", () => {
    const session = new CodexSession({ model: "o3", cwd: "/tmp" });
    const result = session
      .onApproval(async () => ({ accept: true as const }))
      .onTurnCompleted(() => {})
      .onItemStarted(() => {})
      .onItemCompleted(() => {})
      .onAgentMessageDelta(() => {})
      .onCommandOutputDelta(() => {});
    expect(result).toBe(session);
  });

  test("guardrail is accessible", () => {
    const session = new CodexSession({});
    expect(session.guardrail).toBeDefined();
  });
});
