import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveHookClientPath(): string {
  return path.join(__dirname, "hook_client.js");
}

export interface HookSettingsConfig {
  socketPath: string;
  hookScriptDir?: string;
}

export async function writeHookSettings(homeDir: string, config: HookSettingsConfig): Promise<void> {
  const hookClientPath = resolveHookClientPath();
  const command = `node ${hookClientPath} ${config.socketPath}`;

  const settingsPath = path.join(homeDir, ".claude", "settings.json");
  const settings = buildSettingsJson(command);
  await mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
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
