import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveHookClientSource(): string {
  const candidates = [
    path.join(__dirname, "hook_client.js"),
    path.join(__dirname, "claude_code", "hook_client.js"),
    path.join(__dirname, "hook_client.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`hook_client not found in any of: ${candidates.join(", ")}`);
}

export interface GeneratedPlugin {
  pluginDir: string;
  cleanup(): Promise<void>;
}

export async function generatePlugin(socketPath: string): Promise<GeneratedPlugin> {
  const pluginDir = path.join(os.tmpdir(), `toll-free-plugin-${randomUUID()}`);

  await mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await mkdir(path.join(pluginDir, "hooks"), { recursive: true });

  await writeFile(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "toll-free-harness",
      description: "Hook bridge for toll-free-harness PTY automation",
      version: "1.0.0",
    }, null, 2),
    "utf8",
  );

  const hookClientSource = resolveHookClientSource();
  const isTypeScript = hookClientSource.endsWith(".ts");
  const hookClientFilename = isTypeScript ? "hook_client.ts" : "hook_client.js";
  const runner = isTypeScript ? "npx tsx" : "node";
  const command = `${runner} \${CLAUDE_PLUGIN_ROOT}/${hookClientFilename} ${socketPath}`;
  await writeFile(
    path.join(pluginDir, "hooks", "hooks.json"),
    JSON.stringify({
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
    }, null, 2),
    "utf8",
  );

  await copyFile(hookClientSource, path.join(pluginDir, hookClientFilename));

  return {
    pluginDir,
    async cleanup() {
      await rm(pluginDir, { recursive: true, force: true });
    },
  };
}
