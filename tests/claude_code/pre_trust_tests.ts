import { afterEach, describe, expect, test } from "vitest";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { preTrust } from "../../src/claude_code/pre_trust.js";

describe("preTrust", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates .claude.json with onboarding and trust", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "pretrust-"));
    await preTrust(tmpDir, "/tmp/project");
    const data = JSON.parse(readFileSync(path.join(tmpDir, ".claude.json"), "utf8"));
    expect(data.hasCompletedOnboarding).toBe(true);
    expect(data.projects["/tmp/project"].hasTrustDialogAccepted).toBe(true);
  });

  test("merges with existing .claude.json", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "pretrust-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(tmpDir, ".claude.json"), JSON.stringify({ existingKey: "preserved" }), "utf8");
    await preTrust(tmpDir, "/tmp/project");
    const data = JSON.parse(readFileSync(path.join(tmpDir, ".claude.json"), "utf8"));
    expect(data.existingKey).toBe("preserved");
    expect(data.hasCompletedOnboarding).toBe(true);
  });

  test("creates file if it doesn't exist", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "pretrust-"));
    expect(existsSync(path.join(tmpDir, ".claude.json"))).toBe(false);
    await preTrust(tmpDir, "/tmp");
    expect(existsSync(path.join(tmpDir, ".claude.json"))).toBe(true);
  });
});
