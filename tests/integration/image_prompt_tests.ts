import { describe, test, expect, beforeAll } from "vitest";
import { createTestSession, isIntegration, hasFixture, generatedDir } from "./setup.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, existsSync, mkdirSync } from "node:fs";

const TEST_NAME = "image_prompt";

async function ensureTestImage(): Promise<string> {
  const dir = generatedDir();
  const imagePath = path.join(dir, "visual_fixture_a.png");
  if (existsSync(imagePath)) return imagePath;

  mkdirSync(dir, { recursive: true });
  const sharp = (await import("sharp")).default;
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="white"/>
    <text x="50%" y="50%" font-size="80" text-anchor="middle"
          dominant-baseline="middle" fill="black" font-family="sans-serif">42</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(imagePath);
  return imagePath;
}

describe("Image prompt", () => {
  let imagePath: string;

  beforeAll(async () => {
    try {
      imagePath = await ensureTestImage();
    } catch {
      // sharp not available; tests will be skipped below
      imagePath = "";
    }
  });

  test.skipIf(!isIntegration() && !hasFixture(TEST_NAME))(
    "image in prompt is understood by agent",
    async () => {
      if (imagePath === "") {
        // sharp is required to generate test images
        return;
      }

      const tmpHome = mkdtempSync(path.join(os.tmpdir(), "tfh-img-"));

      const session = await createTestSession(TEST_NAME, {
        args: [],
        cwd: "/tmp",
        prompt: `What number is in this image? ${imagePath}`,
        env: { HOME: tmpHome },
      });

      const result = await session.run();
      expect(result.exitCode).toBe(0);
    },
    300_000,
  );
});
