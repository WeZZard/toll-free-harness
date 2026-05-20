import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";
import type { AskUserQuestionEvent } from "../../src/claude_code/types.js";

const TEST_NAME = "ask_question";

describe("AskUserQuestion interaction", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "handler receives structured question event",
    async () => {
      const tmpHome = createIsolatedHome();
      const received: AskUserQuestionEvent[] = [];

      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "bypassPermissions"],
        cwd: "/tmp",
        prompt: "Use the AskUserQuestion tool to ask me which programming language I prefer. Provide these options: TypeScript, Python, Rust. Do nothing else after I answer.",
        env: { HOME: tmpHome },
      });

      session.onAskUserQuestion(async (event) => {
        received.push(event);
        return { selectedIndex: 0 };
      });

      const result = await session.run();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      if (isIntegration()) {
        expect(received.length).toBeGreaterThan(0);
        expect(received[0]!.questions.length).toBeGreaterThan(0);
        expect(received[0]!.questions[0]!.options.length).toBeGreaterThanOrEqual(3);
      }
    },
    300_000,
  );
});
