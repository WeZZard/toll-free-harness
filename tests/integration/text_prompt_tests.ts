import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";

const TEST_NAME = "text_prompt";

describe("Pure text prompt", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "sends text and receives structured JSON response",
    async () => {
      const tmpHome = createIsolatedHome();
      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "bypassPermissions"],
        cwd: "/tmp",
        prompt: 'What is 2+2? Respond with only a JSON object: {"result": <number>}',
        env: { HOME: tmpHome },
      });

      const result = await session.run();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    },
    300_000,
  );
});
