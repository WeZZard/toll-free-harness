# toll-free-harness

Interactive terminal harness for AI coding agents -- no programmatic billing toll.

`toll-free-harness` drives Claude Code through its interactive terminal via hooks and a PTY. It avoids the `-p` (pipe/programmatic) flag entirely, so every token stays on your Max subscription budget instead of consuming programmatic API credits.

## Why this exists

Starting June 15, 2026, Anthropic splits Claude Code billing into two pools: interactive terminal usage (covered by Max/Team subscriptions) and programmatic `-p` mode (billed against a separate API credit pool at standard API rates). If you automate Claude Code with `-p`, you pay API prices. If you automate it through the interactive terminal with hooks, you pay nothing extra beyond your subscription.

This library automates Claude Code through the interactive terminal. It spawns Claude Code in a PTY, wires up a local HTTP hook server, and routes hook events to your handlers -- all without touching `-p` mode.

## Installation

```bash
pnpm add toll-free-harness node-pty
```

`node-pty` is a peer dependency (it requires native compilation). Install it alongside the harness.

## Quick start

```typescript
import { ClaudeCodeSession, typeMessage } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: "/path/to/your/project",
  prompt: "Fix the failing tests in src/utils.ts",
});

// Handle permission requests by tool name
session.onPermissionRequest("AskUserQuestion", async (req) => {
  // Respond to the agent's question via keystroke
  session.write(typeMessage("Yes, proceed with that approach."));
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" },
    },
  };
});

session.onPermissionRequest("ExitPlanMode", async (req) => {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" },
    },
  };
});

// Run the session to completion
const result = await session.run();
console.log(`Exit code: ${result.exitCode}`);
```

## API reference

### `ClaudeCodeSession`

Main entry point. Spawns Claude Code in a PTY and connects it to the hook server.

```typescript
const session = new ClaudeCodeSession(config: SessionConfig);
```

**`SessionConfig`** fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `args` | `string[]` | yes | CLI arguments passed to `claude` |
| `cwd` | `string` | yes | Working directory for the spawned process |
| `prompt` | `string` | yes | The prompt sent to Claude Code |
| `env` | `Record<string, string>` | no | Additional environment variables |
| `bin` | `string` | no | Path to the `claude` binary (default: `"claude"`) |
| `cols` | `number` | no | Terminal columns (default: `120`) |
| `rows` | `number` | no | Terminal rows (default: `40`) |
| `hookScriptDir` | `string` | no | Where to write hook scripts (default: `~/.toll-free-hooks`) |

**Handler registration** (all return `this` for chaining):

- `onPreToolUse(toolName, handler)` -- called before a tool executes. Use `"*"` as a wildcard.
- `onPermissionRequest(toolName, handler)` -- called when Claude Code asks for permission. Use `"*"` as a wildcard.
- `onPostToolUse(toolName, handler)` -- called after a tool executes. Use `"*"` as a wildcard.
- `onStop(handler)` -- called when the session stops.
- `onUserPromptSubmit(handler)` -- called when a user prompt is submitted.

Unregistered `PreToolUse` events auto-allow. Unregistered `PermissionRequest` events auto-allow.

**Methods:**

- `run(): Promise<SessionResult>` -- starts the hook server, writes settings, spawns Claude Code, and blocks until exit.
- `write(data: string)` -- sends raw keystrokes to the PTY.
- `stop()` -- kills the PTY process.
- `guardrail` -- access the `EventSequenceGuardrail` for deterministic event verification.

### `EventSequenceGuardrail`

Wait for specific hook events with timeouts. Useful for writing deterministic test flows.

```typescript
// Wait for a specific event
const event = await session.guardrail.expect(
  { kind: "permission_request", toolName: "Bash" },
  10_000, // timeout in ms
);

// Wait for any of several event kinds
const event = await session.guardrail.expectAny(
  ["stop", "permission_request"],
  30_000,
);
```

Throws `GuardrailTimeoutError` if the expected event does not arrive within the timeout.

### Keystroke helpers

Convenience functions that return strings suitable for `session.write()`:

- `typeMessage(text)` -- types text and presses Enter.
- `selectOptionByNumber(index)` -- selects a numbered menu option (0-indexed).
- `approveExitPlanMode()` -- approves exiting plan mode (sends `"1"`).
- `rejectExitPlanMode()` -- rejects exiting plan mode (sends Escape).

### `writeHookSettings`

Generates `~/.claude/settings.json` with the hook configuration pointing at the local hook server. Called automatically by `session.run()` -- you only need this if you are managing the lifecycle manually.

### `HookServer`

Low-level HTTP server that receives hook events from Claude Code. Managed internally by `ClaudeCodeSession` -- direct use is only needed for advanced scenarios.

## How it works

1. `session.run()` starts an HTTP server on a random local port.
2. It writes a small bash script to `~/.toll-free-hooks/toll-free-hook.sh` that forwards hook payloads to the server via `curl`.
3. It writes `~/.claude/settings.json` configuring Claude Code to call that script for all hook events (`PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`).
4. It spawns `claude` in a PTY with your args and prompt -- standard interactive mode, no `-p` flag.
5. Claude Code fires hooks as it runs. The bash script pipes each event to the local HTTP server, which dispatches to your registered handlers.
6. Your handlers return JSON responses (allow/deny/modify) back through the same path.
7. When Claude Code exits, `run()` resolves with the exit code.

```
Claude Code (PTY)
    |
    | hook fires
    v
toll-free-hook.sh (curl)
    |
    | HTTP POST
    v
HookServer (localhost)
    |
    | dispatch
    v
Your handlers
```

## License

Apache-2.0
