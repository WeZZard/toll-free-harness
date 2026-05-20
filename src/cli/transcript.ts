import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export async function extractResult(homeDir: string, sessionId: string): Promise<string> {
  // Claude Code stores sessions at $HOME/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
  // We need to find the right project directory
  const projectsDir = path.join(homeDir, ".claude", "projects");
  if (!existsSync(projectsDir)) return "";

  // Search all project dirs for our session
  for (const dir of readdirSync(projectsDir)) {
    const sessionFile = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (existsSync(sessionFile)) {
      return extractFromSessionFile(sessionFile);
    }
  }
  return "";
}

async function extractFromSessionFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  const lines = content.trim().split("\n");

  // Find the last assistant message with text content
  let lastText = "";
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const msg = obj.message;
      if (obj.type === "assistant" && msg && typeof msg === "object") {
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string") {
              lastText = block.text;
            }
          }
        }
      }
    } catch {}
  }
  return lastText;
}
