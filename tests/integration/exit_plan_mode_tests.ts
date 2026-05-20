import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";
import type { ExitPlanModeEvent } from "../../src/claude_code/types.js";

const TEST_NAME = "exit_plan_mode";

describe("ExitPlanMode interaction", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "handler receives plan text and approval works",
    async () => {
      const tmpHome = createIsolatedHome();
      const received: ExitPlanModeEvent[] = [];

      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "bypassPermissions"],
        cwd: "/tmp",
        prompt: "Enter plan mode. Design a plan for creating a hello world script in TypeScript. Then call ExitPlanMode to present the plan for my approval.",
        env: { HOME: tmpHome },
      });

      session.onExitPlanMode(async (event) => {
        received.push(event);
        return { decision: "approve" };
      });

      session.onAskUserQuestion(async () => ({ selectedIndex: 0 }));

      const result = await session.run();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      if (isIntegration()) {
        expect(received.length).toBeGreaterThan(0);
        expect(received[0]!.planText.length).toBeGreaterThan(0);
      }
    },
    300_000,
  );
});
