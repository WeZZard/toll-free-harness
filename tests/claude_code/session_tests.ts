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

vi.mock("../../src/claude_code/plugin_generator.js", () => ({
  generatePlugin: vi.fn().mockResolvedValue({
    pluginDir: "/tmp/toll-free-plugin-test",
    cleanup: vi.fn().mockResolvedValue(undefined),
  }),
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

  test("onAskUserQuestion returns this (fluent)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onAskUserQuestion(async () => ({ selectedIndex: 0 }));
    expect(result).toBe(session);
  });

  test("onExitPlanMode returns this (fluent)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onExitPlanMode(async () => ({ decision: "approve" as const }));
    expect(result).toBe(session);
  });

  test("sendPrompt is a public method", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    expect(typeof session.sendPrompt).toBe("function");
  });

  test("write is not exposed as public", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    // TypeScript enforces this at compile time via private modifier.
    // At runtime, verify the property name does not exist on the instance.
    expect("write" in session).toBe(false);
  });

  test("onPreToolUse returns this (fluent, read-only)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPreToolUse("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onPostToolUse returns this (fluent, read-only)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPostToolUse("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onPermissionRequest returns this (fluent)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onPermissionRequest("Bash", async () => {});
    expect(result).toBe(session);
  });

  test("onStop returns this (fluent)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onStop(async () => {});
    expect(result).toBe(session);
  });

  test("onUserPromptSubmit returns this (fluent)", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session.onUserPromptSubmit(async () => {});
    expect(result).toBe(session);
  });

  test("guardrail is accessible", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    expect(session.guardrail).toBeDefined();
  });

  test("chaining multiple APIs", () => {
    const session = new ClaudeCodeSession({ args: [], cwd: "/tmp", prompt: "test" });
    const result = session
      .onAskUserQuestion(async () => ({ selectedIndex: 0 }))
      .onExitPlanMode(async () => ({ decision: "approve" as const }))
      .onPreToolUse("Bash", async () => {})
      .onPostToolUse("Bash", async () => {})
      .onPermissionRequest("*", async () => {})
      .onStop(async () => {})
      .onUserPromptSubmit(async () => {});
    expect(result).toBe(session);
  });
});
