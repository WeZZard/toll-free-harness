import { describe, test, expect } from "vitest";
import { adaptClaudeCodeArgs } from "../../src/cli/adapt_claude_code.js";

describe("adaptClaudeCodeArgs", () => {
  describe("print mode detection", () => {
    test("detects -p", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt"]);
      expect(result.printMode).toBe(true);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual([]);
    });

    test("detects --print", () => {
      const result = adaptClaudeCodeArgs(["--print", "prompt"]);
      expect(result.printMode).toBe(true);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual([]);
    });

    test("no -p means no print mode", () => {
      const result = adaptClaudeCodeArgs(["prompt", "--model", "opus"]);
      expect(result.printMode).toBe(false);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual(["--model", "opus"]);
    });

    test("-p between other args", () => {
      const result = adaptClaudeCodeArgs(["--model", "opus", "-p", "prompt"]);
      expect(result.printMode).toBe(true);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual(["--model", "opus"]);
    });
  });

  describe("format extraction", () => {
    test("extracts --output-format", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt", "--output-format", "json"]);
      expect(result.outputFormat).toBe("json");
      expect(result.remainingArgs).toEqual([]);
    });

    test("extracts --input-format", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt", "--input-format", "stream-json"]);
      expect(result.inputFormat).toBe("stream-json");
      expect(result.remainingArgs).toEqual([]);
    });

    test("extracts both formats", () => {
      const result = adaptClaudeCodeArgs([
        "-p", "prompt", "--output-format", "json", "--input-format", "stream-json",
      ]);
      expect(result.outputFormat).toBe("json");
      expect(result.inputFormat).toBe("stream-json");
      expect(result.remainingArgs).toEqual([]);
    });

    test("no format flags", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt"]);
      expect(result.outputFormat).toBeUndefined();
      expect(result.inputFormat).toBeUndefined();
    });
  });

  describe("prompt extraction", () => {
    test("prompt first", () => {
      const result = adaptClaudeCodeArgs(["prompt", "--model", "opus"]);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual(["--model", "opus"]);
    });

    test("prompt last", () => {
      const result = adaptClaudeCodeArgs(["--model", "opus", "prompt"]);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual(["--model", "opus"]);
    });

    test("prompt between flags", () => {
      const result = adaptClaudeCodeArgs(["--model", "opus", "prompt", "--verbose"]);
      expect(result.prompt).toBe("prompt");
      expect(result.remainingArgs).toEqual(["--model", "opus", "--verbose"]);
    });

    test("no prompt", () => {
      const result = adaptClaudeCodeArgs(["--model", "opus"]);
      expect(result.prompt).toBeUndefined();
      expect(result.remainingArgs).toEqual(["--model", "opus"]);
    });

    test("only -p, no prompt", () => {
      const result = adaptClaudeCodeArgs(["-p"]);
      expect(result.printMode).toBe(true);
      expect(result.prompt).toBeUndefined();
    });
  });

  describe("pass-through (remaining args)", () => {
    test("flags pass through", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt", "--model", "opus", "--effort", "high"]);
      expect(result.remainingArgs).toEqual(["--model", "opus", "--effort", "high"]);
    });

    test("boolean flags pass through", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt", "--verbose"]);
      expect(result.remainingArgs).toEqual(["--verbose"]);
    });

    test("unknown flags pass through", () => {
      const result = adaptClaudeCodeArgs(["-p", "prompt", "--some-new-flag", "value"]);
      expect(result.remainingArgs).toEqual(["--some-new-flag", "value"]);
    });

    test("preserves order", () => {
      const result = adaptClaudeCodeArgs(["--verbose", "-p", "--model", "opus", "prompt"]);
      expect(result.remainingArgs).toEqual(["--verbose", "--model", "opus"]);
    });
  });
});
