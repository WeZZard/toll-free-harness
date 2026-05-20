import { describe, expect, test, vi } from "vitest";

vi.mock("node-pty", () => ({
  default: {
    spawn: vi.fn(() => ({
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      kill: vi.fn(),
    })),
  },
}));

vi.mock("../../src/claude_code/hook_server.js", () => {
  return {
    HookServer: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue("/tmp/test.sock"),
      stop: vi.fn().mockResolvedValue(undefined),
      setEventListener: vi.fn(),
      setHandler: vi.fn(),
      socketPath: "/tmp/test.sock",
    })),
  };
});

vi.mock("../../src/claude_code/hook_settings.js", () => ({
  writeHookSettings: vi.fn().mockResolvedValue(undefined),
}));

const { ClaudeCodeSession } = await import("../../src/claude_code/session.js");

describe("ClaudeCodeSession", () => {
  test("constructor stores config", () => {
    const config = {
      args: ["--print"],
      cwd: "/tmp",
      prompt: "hello",
    };
    const session = new ClaudeCodeSession(config);
    expect(session.config).toBe(config);
  });

  test("onPreToolUse returns this for fluent chaining", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPreToolUse("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onPermissionRequest returns this for fluent chaining", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPermissionRequest("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onPostToolUse returns this for fluent chaining", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPostToolUse("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onStop returns this for fluent chaining", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onStop(async () => {});
    expect(result).toBe(session);
  });

  test("onUserPromptSubmit returns this for fluent chaining", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onUserPromptSubmit(async () => {});
    expect(result).toBe(session);
  });

  test("fluent API allows chaining multiple listeners", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session
      .onPreToolUse("Bash", async () => {})
      .onPostToolUse("Bash", async () => {})
      .onPermissionRequest("*", async () => {})
      .onStop(async () => {});
    expect(result).toBe(session);
  });

  test("guardrail property is accessible", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    expect(session.guardrail).toBeDefined();
  });
});
