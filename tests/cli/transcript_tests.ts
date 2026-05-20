import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { extractResult } from "../../src/cli/transcript.js";

describe("extractResult", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("extracts last assistant text from session.jsonl", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "transcript-test-"));
    const projectDir = path.join(tmpDir, ".claude", "projects", "test-project");
    mkdirSync(projectDir, { recursive: true });

    const sessionId = "test-session-123";
    const lines = [
      JSON.stringify({ type: "user", message: { content: "hello" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "The answer is 4" }] } }),
    ];
    writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), lines.join("\n"), "utf8");

    const result = await extractResult(tmpDir, sessionId);
    expect(result).toBe("The answer is 4");
  });

  test("returns empty string when no session found", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "transcript-test-"));
    const result = await extractResult(tmpDir, "nonexistent");
    expect(result).toBe("");
  });

  test("returns last assistant text when multiple turns", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "transcript-test-"));
    const projectDir = path.join(tmpDir, ".claude", "projects", "test-project");
    mkdirSync(projectDir, { recursive: true });

    const sessionId = "multi-turn";
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "first response" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "final response" }] } }),
    ];
    writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), lines.join("\n"), "utf8");

    const result = await extractResult(tmpDir, sessionId);
    expect(result).toBe("final response");
  });
});
