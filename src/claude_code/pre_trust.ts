import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export async function preTrust(homeDir: string, cwd: string): Promise<void> {
  const claudeJsonPath = path.join(homeDir, ".claude.json");

  let existing: Record<string, unknown> = {};
  if (existsSync(claudeJsonPath)) {
    try {
      existing = JSON.parse(await readFile(claudeJsonPath, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  existing.hasCompletedOnboarding = true;
  existing.lastOnboardingVersion = "99.0.0";

  const projects = (typeof existing.projects === "object" && existing.projects !== null)
    ? existing.projects as Record<string, Record<string, unknown>>
    : {};

  const projectConfig = projects[cwd] ?? {};
  projectConfig.hasTrustDialogAccepted = true;
  projects[cwd] = projectConfig;
  existing.projects = projects;

  await writeFile(claudeJsonPath, JSON.stringify(existing, null, 2), "utf8");
}
