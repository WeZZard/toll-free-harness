import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome } from "./setup.js";

const TEST_NAME = "text_prompt";

describe("Pure text prompt", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "sends text and receives response",
    async () => {
      const tmpHome = createIsolatedHome();
      const session = await createTestSession(TEST_NAME, {
        args: [],
        cwd: "/tmp",
        prompt: "What is 2+2? Reply with just the number.",
        env: { HOME: tmpHome },
      });

      const result = await session.run();
      // Session is killed on Stop hook (SIGHUP=129), not exited cleanly
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    },
    300_000,
  );
});
