# toll-free-harness

Interactive PTY harness for local coding agents.

`toll-free-harness` is an experimental local PTY harness for driving terminal-based coding agents from code. It spawns an interactive agent process, connects hook events to local handlers, and lets developers build deterministic automation around tools that were originally designed for terminal use.

The name is a joke about toll booths around developer workflows. The project itself is about local runtime control.

## What this project is

- A local runtime-control layer for interactive agent CLIs
- A way to build deterministic automation, hooks, event handling, and integration tests around terminal-based tools
- An experimental PTY harness that bridges the gap between interactive-only CLIs and programmatic workflows

## What this project is not

- Not an API proxy, relay, or access gateway
- Not a credential-sharing or token-pooling service
- Not a way to resell, redistribute, or pool access to any AI provider
- Not a guarantee of free usage or a billing workaround of any kind

This project does not provide, proxy, resell, pool, or route access to any third-party AI service. Users run their own local tools with their own accounts and are responsible for complying with the terms of those tools.

## When to use this

Some coding agent CLIs were designed for terminal use and have limited or incomplete headless/programmatic modes. This library provides a local harness for those agents, giving you structured event handling and deterministic control without requiring the agent vendor to ship a separate SDK.

If an agent already provides a stable programmatic API or SDK (e.g., an app-server protocol, a documented JSON-RPC interface), use that directly instead of this library.

## Installation

```bash
pnpm add toll-free-harness node-pty
```

`node-pty` is a peer dependency (requires native compilation). Install it alongside the harness.

No additional system dependencies are required. The hook client is a bundled Node.js script -- no bash, curl, or external tools needed.

## Quick start

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: "/path/to/your/project",
  prompt: "Fix the failing tests in src/utils.ts",
});

session.onPermissionRequest("AskUserQuestion", async (req) => {
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

const result = await session.run();
console.log(`Exit code: ${result.exitCode}`);
```

## API reference

### `ClaudeCodeSession`

Main entry point. Spawns the agent CLI in a PTY and connects it to the hook server.

```typescript
const session = new ClaudeCodeSession(config: SessionConfig);
```

**`SessionConfig`** fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `args` | `string[]` | yes | CLI arguments passed to the agent binary |
| `cwd` | `string` | yes | Working directory for the spawned process |
| `prompt` | `string` | yes | The initial prompt sent to the agent |
| `env` | `Record<string, string>` | no | Additional environment variables |
| `bin` | `string` | no | Path to the agent binary (default: `"claude"`) |
| `cols` | `number` | no | Terminal columns (default: `120`) |
| `rows` | `number` | no | Terminal rows (default: `40`) |

**Handler registration** (all return `this` for chaining):

- `onPreToolUse(toolName, handler)` -- called before a tool executes. Use `"*"` as a wildcard.
- `onPermissionRequest(toolName, handler)` -- called when the agent asks for permission. Use `"*"` as a wildcard.
- `onPostToolUse(toolName, handler)` -- called after a tool executes. Use `"*"` as a wildcard.
- `onStop(handler)` -- called when the session stops.
- `onUserPromptSubmit(handler)` -- called when a user prompt is submitted.

**Methods:**

- `run(): Promise<SessionResult>` -- starts the hook server, writes settings, spawns the agent, and blocks until exit.
- `write(data: string)` -- sends raw keystrokes to the PTY.
- `stop()` -- kills the PTY process.
- `guardrail` -- access the `EventSequenceGuardrail` for deterministic event verification.

### `EventSequenceGuardrail`

Wait for specific hook events with timeouts. Useful for writing deterministic test flows.

```typescript
const event = await session.guardrail.expect(
  { kind: "permission_request", toolName: "Bash" },
  10_000,
);

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

Generates hook configuration in the agent's settings file. Called automatically by `session.run()`. See the safety section below for important caveats.

### `HookServer`

Low-level HTTP server listening on a Unix domain socket. Managed internally by `ClaudeCodeSession` -- direct use is only needed for advanced scenarios.

## How it works

1. `session.run()` starts an HTTP server on a Unix domain socket at `/tmp/toll-free-<uuid>.sock`. Each session gets a unique socket path, so concurrent sessions never collide.
2. It writes hook configuration to the agent's settings file, pointing all hook events at the bundled Node.js hook client.
3. It spawns the agent binary in a PTY with your args and prompt.
4. The agent fires hooks as it runs. The hook client reads the event payload from stdin, sends it as an HTTP POST over the Unix socket, and pipes the response back to stdout.
5. Your handlers return JSON responses (allow/deny/modify) back through the same path.
6. When the agent exits, `run()` resolves with the exit code and the socket file is cleaned up.

```
Agent CLI (PTY)
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

The hook client uses Node.js `http.request({ socketPath })` for IPC. Node.js supports AF_UNIX sockets on macOS, Linux, and Windows 10 1803+, so no platform-specific dependencies are needed.

## Safety and configuration

### Permission defaults

**Unregistered `PreToolUse` and `PermissionRequest` events are auto-allowed by default.** This means any tool call or permission request that you have not explicitly registered a handler for will be silently approved.

This is unsafe in untrusted environments. Only use the default behavior in trusted local development and testing scenarios where you control the agent's execution context.

To restrict this behavior, register a wildcard handler that denies by default:

```typescript
session.onPermissionRequest("*", async (req) => {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "deny", message: "Not approved by harness." },
    },
  };
});

// Then register specific handlers for tools you want to allow
session.onPermissionRequest("AskUserQuestion", async (req) => {
  // ... your handler
});
```

Note: specific tool-name handlers take precedence over the `"*"` wildcard.

### Settings file modification

`session.run()` writes to `~/.claude/settings.json` (or `$HOME/.claude/settings.json` if `env.HOME` is set). This is the agent's user-level configuration file.

**Important caveats:**

1. **No backup is created.** The existing `settings.json` is overwritten, not backed up. If you have custom hooks or settings configured, they will be lost.
2. **No restore on exit.** When the session ends (normally or via crash), the modified `settings.json` is NOT restored to its previous state.
3. **Concurrent sessions sharing the same HOME** will overwrite each other's settings. Each session writes its own socket path into the settings file. Use isolated HOME directories (via `env.HOME`) to avoid this.
4. **Process crashes** leave the modified `settings.json` in place. The Unix socket file at `/tmp/toll-free-<uuid>.sock` is cleaned up on normal exit but may be orphaned on crashes (harmless -- the next session uses a new UUID).
5. **Files touched on the user's machine:**
   - `$HOME/.claude/settings.json` -- overwritten with hook configuration
   - `/tmp/toll-free-<uuid>.sock` -- Unix domain socket (created, cleaned up on exit)

**Recommendation:** Always set `env.HOME` to an isolated directory when using this library, so that your real `~/.claude/settings.json` is never touched:

```typescript
const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: "/path/to/project",
  prompt: "...",
  env: { HOME: "/tmp/isolated-home" },
});
```

### TODO

- Back up and restore `settings.json` around sessions
- Add a `defaultPermissionBehavior: "deny"` option to `SessionConfig`
- Warn at startup if `env.HOME` is not set to an isolated directory

## License

Apache-2.0
