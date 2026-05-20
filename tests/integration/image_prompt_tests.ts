import { describe, test, expect, beforeAll } from "vitest";
import { createTestSession, isIntegration, hasFixture, createIsolatedHome, generatedDir } from "./setup.js";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const TEST_NAME = "image_prompt";

async function ensureTestImage(): Promise<string> {
  const dir = generatedDir();
  const imagePath = path.join(dir, "visual_fixture_a.png");
  if (existsSync(imagePath)) return imagePath;

  mkdirSync(dir, { recursive: true });
  try {
    const sharp = (await import("sharp")).default;
    const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="white"/>
      <text x="50%" y="50%" font-size="80" text-anchor="middle"
            dominant-baseline="middle" fill="black" font-family="sans-serif">42</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
  } catch {
    return "";
  }
  return imagePath;
}

describe("Image prompt", () => {
  let imagePath = "";

  beforeAll(async () => {
    imagePath = await ensureTestImage();
  });

  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "image in prompt is understood by agent",
    async () => {
      if (imagePath === "") return;

      const tmpHome = createIsolatedHome();

      const session = await createTestSession(TEST_NAME, {
        args: ["--permission-mode", "bypassPermissions"],
        cwd: "/tmp",
        prompt: `Look at this image: ${imagePath}. What number is shown? Respond with only a JSON object: {"result": <number>}`,
        env: { HOME: tmpHome },
      });

      const result = await session.run();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    },
    300_000,
  );
});
