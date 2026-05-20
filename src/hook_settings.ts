import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface HookSettingsConfig {
  socketPath: string;
  hookScriptDir: string;
  scriptName?: string;
}

export async function writeHookSettings(homeDir: string, config: HookSettingsConfig): Promise<void> {
  await mkdir(config.hookScriptDir, { recursive: true });

  const scriptName = config.scriptName ?? "toll-free-hook.sh";
  const scriptPath = path.join(config.hookScriptDir, scriptName);
  await writeFile(scriptPath, buildHookScript(config.socketPath), { mode: 0o755 });

  const settingsPath = path.join(homeDir, ".claude", "settings.json");
  const settings = buildSettingsJson(scriptPath);
  await mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function buildHookScript(socketPath: string): string {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `INPUT=$(cat)`,
    `RESPONSE=$(echo "$INPUT" | curl -s --unix-socket "${socketPath}" -X POST -H "Content-Type: application/json" -d @- "http://localhost/hook" 2>/dev/null)`,
    `echo "$RESPONSE"`,
  ].join("\n") + "\n";
}

function buildSettingsJson(scriptPath: string): Record<string, unknown> {
  return {
    enabledPlugins: {},
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: scriptPath, timeout: 120 }] },
      ],
      PermissionRequest: [
        { matcher: "", hooks: [{ type: "command", command: scriptPath, timeout: 120 }] },
      ],
      PostToolUse: [
        { matcher: "", hooks: [{ type: "command", command: scriptPath, timeout: 10 }] },
      ],
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: scriptPath, timeout: 30 }] },
      ],
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: scriptPath, timeout: 30 }] },
      ],
    },
  };
}
