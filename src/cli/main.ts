#!/usr/bin/env node
import { adaptClaudeCodeArgs } from "./adapt_claude_code.js";
import { run } from "./run.js";
import { spawn } from "node:child_process";

const UNSUPPORTED_FORMATS_ERROR = `Error: --output-format json/stream-json and --input-format stream-json
are not available in the toll-free-harness CLI.

These features are provided by the toll-free-harness library API.
See the migration guide:

  curl -s https://raw.githubusercontent.com/WeZZard/toll-free-harness/main/MIGRATION.md

Or install the library:

  npm install toll-free-harness node-pty
`;

const HELP = `toll-free-harness — Interactive terminal harness for local coding agents.

USAGE
  toll-free-harness <agent> -- <prompt> [agent flags...]
  toll-free-harness <agent> -- [agent flags...] (passthrough mode)

AGENTS
  claude    Claude Code

EXAMPLES
  toll-free-harness claude -- -p "fix the failing tests"
  toll-free-harness claude -- -p "explain this error" --allowedTools "Read"
  cat build.log | toll-free-harness claude -- -p "what went wrong?"
  toll-free-harness claude -- --model opus    (passthrough to interactive claude)

DESCRIPTION
  When -p/--print is detected in agent flags, runs the agent in an
  interactive PTY via toll-free-harness, auto-handles startup dialogs,
  and outputs the agent's text response to stdout.

  When -p/--print is NOT detected, spawns the agent as a subprocess
  with stdin/stdout/stderr passed through (transparent passthrough).

  All agent flags except -p and format flags are passed through.
  The following are not supported in harness mode:
    --output-format json|stream-json  (use the toll-free-harness library API)
    --input-format stream-json        (use the toll-free-harness library API)

OPTIONS
  -h, --help      Show this help
  -v, --version   Show version
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write("toll-free-harness 0.1.0\n");
    process.exit(0);
  }

  const agent = argv[0];
  if (agent !== "claude") {
    process.stderr.write(`Error: Unknown agent "${agent}". Supported: claude\n`);
    process.exit(1);
  }

  const separatorIdx = argv.indexOf("--");
  if (separatorIdx === -1) {
    process.stderr.write("Error: Missing -- separator. Usage: toll-free-harness claude -- <args>\n");
    process.exit(1);
  }

  const agentArgs = argv.slice(separatorIdx + 1);
  const adapted = adaptClaudeCodeArgs(agentArgs);

  if (adapted.printMode) {
    // Harness mode: validate format flags
    const unsupportedOutput = adapted.outputFormat === "json" || adapted.outputFormat === "stream-json";
    const unsupportedInput = adapted.inputFormat === "stream-json";
    if (unsupportedOutput || unsupportedInput) {
      process.stderr.write(UNSUPPORTED_FORMATS_ERROR);
      process.exit(1);
    }

    if (!adapted.prompt) {
      process.stderr.write("Error: No prompt provided. Usage: toll-free-harness claude -- -p \"<prompt>\" [flags]\n");
      process.exit(1);
    }

    // Read stdin if piped
    let fullPrompt = adapted.prompt;
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const stdin = Buffer.concat(chunks).toString("utf8").trim();
      if (stdin) {
        fullPrompt = `${stdin}\n\n${fullPrompt}`;
      }
    }

    try {
      const result = await run({
        prompt: fullPrompt,
        args: adapted.remainingArgs,
        cwd: process.cwd(),
      });
      if (result) {
        process.stdout.write(result + "\n");
      }
    } catch (error) {
      process.stderr.write(`Error: ${String(error)}\n`);
      process.exit(1);
    }
  } else {
    // Passthrough mode: spawn claude as subprocess
    const child = spawn("claude", agentArgs, { stdio: "inherit" });
    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    child.on("error", (err) => {
      process.stderr.write(`Error: Failed to spawn claude: ${err.message}\n`);
      process.exit(1);
    });
  }
}

main();
