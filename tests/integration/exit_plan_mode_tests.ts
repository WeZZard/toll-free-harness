import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";
import type { ExitPlanModeEvent } from "../../src/claude_code/types.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";

const TEST_NAME = "exit_plan_mode";

describe("ExitPlanMode interaction", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "handler receives plan text and approval works",
    async () => {
      const tmpHome = createIsolatedHome();
      const projectDir = mkdtempSync(path.join(os.tmpdir(), "tfh-project-"));
      writeFileSync(
        path.join(projectDir, "index.ts"),
        "// empty project",
        "utf8",
      );

      const received: ExitPlanModeEvent[] = [];

      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "plan"],
        cwd: projectDir,
        prompt: "Add a README to this project",
        env: { HOME: tmpHome },
      });

      session.onExitPlanMode(async (event) => {
        received.push(event);
        return { decision: "approve" };
      });

      session.onAskUserQuestion(async () => ({ selectedIndex: 0 }));

      const result = await session.run();

      expect(result.exitCode).toBe(0);
      if (isIntegration()) {
        expect(received.length).toBeGreaterThan(0);
        expect(received[0]!.planText.length).toBeGreaterThan(0);
      }
    },
    300_000,
  );
});
