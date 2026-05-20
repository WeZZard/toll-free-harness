import { ClaudeCodeSession } from "../claude_code/session.js";
import { extractResult } from "./transcript.js";
import os from "node:os";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface RunOptions {
  prompt: string;
  args: string[];
  cwd: string;
}

export async function run(options: RunOptions): Promise<string> {
  const sessionId = randomUUID();

  const hasPermissionMode = options.args.some(a => a === "--permission-mode");
  const args = [
    "--session-id", sessionId,
    ...(hasPermissionMode ? options.args : ["--permission-mode", "bypassPermissions", ...options.args]),
  ];

  const session = new ClaudeCodeSession({
    args,
    cwd: options.cwd,
    prompt: options.prompt,
  });

  session.onAskUserQuestion(async (event) => {
    process.stderr.write(`[toll-free] Question: ${event.text}\n`);
    for (const q of event.questions) {
      q.options.forEach((o, i) => process.stderr.write(`  ${i}: ${o.label}\n`));
    }
    process.stderr.write(`[toll-free] Auto-selecting option 0\n`);
    return { selectedIndex: 0 };
  });

  session.onExitPlanMode(async () => {
    process.stderr.write(`[toll-free] Plan review requested, auto-approving\n`);
    return { decision: "approve" as const };
  });

  await session.run();

  const homeDir = os.homedir();
  return extractResult(homeDir, sessionId);
}
