import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HookSettingsConfig {
  socketPath: string;
}

export async function writeHookSettings(homeDir: string, config: HookSettingsConfig): Promise<void> {
  const candidates = [
    path.join(__dirname, "hook_client.js"),
    path.join(__dirname, "claude_code", "hook_client.js"),
    path.join(__dirname, "hook_client.ts"),
  ];
  let hookClientPath = "";
  for (const c of candidates) {
    if (existsSync(c)) { hookClientPath = c; break; }
  }
  if (!hookClientPath) throw new Error(`hook_client not found in: ${candidates.join(", ")}`);

  const runner = hookClientPath.endsWith(".ts") ? "npx tsx" : "node";
  const command = `${runner} ${hookClientPath} ${config.socketPath}`;
  const settingsPath = path.join(homeDir, ".claude", "settings.json");
  await mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(buildSettingsJson(command), null, 2), "utf8");
}

function buildSettingsJson(command: string): Record<string, unknown> {
  return {
    enabledPlugins: {},
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command, timeout: 120 }] },
      ],
      PermissionRequest: [
        { matcher: "", hooks: [{ type: "command", command, timeout: 120 }] },
      ],
      PostToolUse: [
        { matcher: "", hooks: [{ type: "command", command, timeout: 10 }] },
      ],
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command, timeout: 30 }] },
      ],
      Stop: [
        { matcher: "", hooks: [{ type: "command", command, timeout: 30 }] },
      ],
    },
  };
}
