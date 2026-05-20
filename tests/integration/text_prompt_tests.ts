import { describe, test, expect } from "vitest";
import { createTestSession, isIntegration, hasFixture } from "./setup.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

const TEST_NAME = "text_prompt";

describe("Pure text prompt", () => {
  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "sends text and receives response",
    async () => {
      const tmpHome = mkdtempSync(path.join(os.tmpdir(), "tfh-text-"));
      const session = await createTestSession(TEST_NAME, {
        args: [],
        cwd: "/tmp",
        prompt: "What is 2+2? Reply with just the number.",
        env: { HOME: tmpHome },
      });

      const result = await session.run();
      expect(result.exitCode).toBe(0);
    },
    300_000,
  );
});
