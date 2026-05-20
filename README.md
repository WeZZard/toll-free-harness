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

No additional system dependencies are required -- the hook client is a bundled Node.js script, so there is no need for bash, curl, or any other external tool.

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

Generates `~/.claude/settings.json` with the hook configuration pointing at the Unix domain socket. The generated hook command invokes the bundled `hook_client.js` with the socket path. Called automatically by `session.run()` -- you only need this if you are managing the lifecycle manually.

### `HookServer`

Low-level HTTP server listening on a Unix domain socket that receives hook events from Claude Code. Managed internally by `ClaudeCodeSession` -- direct use is only needed for advanced scenarios.

## How it works

1. `session.run()` starts an HTTP server listening on a Unix domain socket at `/tmp/toll-free-<uuid>.sock`. Each session gets its own unique socket path, so concurrent sessions never collide.
2. It writes `~/.claude/settings.json` configuring Claude Code to call the bundled Node.js hook client (`hook_client.js`) for all hook events (`PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`). The hook command looks like: `node <lib>/dist/hook_client.js /tmp/toll-free-<uuid>.sock`.
3. It spawns `claude` in a PTY with your args and prompt -- standard interactive mode, no `-p` flag.
4. Claude Code fires hooks as it runs. The hook client reads the event payload from stdin, sends it as an HTTP POST over the Unix socket to the hook server, and pipes the response back to stdout.
5. Your handlers return JSON responses (allow/deny/modify) back through the same path.
6. When Claude Code exits, `run()` resolves with the exit code and the socket file is cleaned up.

```
Claude Code (PTY)
    |
    | hook fires
    v
hook_client.js (Node.js)
    |
    | HTTP POST over Unix socket
    v
HookServer (/tmp/toll-free-<uuid>.sock)
    |
    | dispatch
    v
Your handlers
```

### Cross-platform support

The hook client uses Node.js `http.request({ socketPath })` for IPC. Node.js supports AF_UNIX sockets on macOS, Linux, and Windows 10 1803+, so no platform-specific dependencies (bash, curl, etc.) are needed.

## License

Apache-2.0
