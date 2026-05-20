import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";
import type { AskUserQuestionEvent } from "../../src/claude_code/types.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";

const TEST_NAME = "ask_question";

describe("AskUserQuestion interaction", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "handler receives structured question event",
    async () => {
      const tmpHome = createIsolatedHome();
      const projectDir = mkdtempSync(path.join(os.tmpdir(), "tfh-project-"));
      writeFileSync(
        path.join(projectDir, "main.ts"),
        "console.log('hello');",
        "utf8",
      );

      const received: AskUserQuestionEvent[] = [];

      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "plan"],
        cwd: projectDir,
        prompt: "Help me improve this project",
        env: { HOME: tmpHome },
      });

      session.onAskUserQuestion(async (event) => {
        received.push(event);
        return { selectedIndex: 0 };
      });

      const result = await session.run();

      expect(result.exitCode).toBe(0);
      if (isIntegration()) {
        expect(received.length).toBeGreaterThan(0);
        expect(received[0]!.questions.length).toBeGreaterThan(0);
        expect(received[0]!.questions[0]!.options.length).toBeGreaterThan(0);
        expect(received[0]!.questions[0]!.options[0]!.label).toBeTruthy();
      }
    },
    300_000,
  );
});
