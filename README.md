# toll-free-harness

Interactive PTY harness for local coding agents.

Spawns an interactive agent CLI in a pseudo-terminal, connects hook events to local listeners, and lets you respond through keystroke injection. Hooks are read-only (observe events, never send data back). All interaction goes through the PTY — faithful to how a real user operates the terminal.

The name is a joke about toll booths around developer workflows.

## What this project is not

Not an API proxy, credential-sharing service, or billing workaround. Users run their own local tools with their own accounts and must comply with those tools' terms.

## Install

```bash
pnpm add toll-free-harness node-pty
```

## Quick start

```typescript
import {
  ClaudeCodeSession,
  selectOptionByNumber,
  approveExitPlanMode,
} from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: "/path/to/project",
  prompt: "Fix the failing tests",
});

// Hooks are read-only: observe events, respond via PTY keystrokes
session.onPreToolUse("AskUserQuestion", async (event) => {
  // event.toolInput has the question data
  session.write(selectOptionByNumber(0)); // select first option
});

session.onPreToolUse("ExitPlanMode", async (event) => {
  session.write(approveExitPlanMode());
});

const result = await session.run();
```

## API

### ClaudeCodeSession

| Method | Description |
|---|---|
| `onPreToolUse(tool, listener)` | Observe before tool executes (blocking — keystrokes buffer until UI renders) |
| `onPermissionRequest(tool, listener)` | Observe permission requests (non-blocking — UI renders in parallel) |
| `onPostToolUse(tool, listener)` | Observe after tool executes |
| `onStop(listener)` | Observe session end |
| `onUserPromptSubmit(listener)` | Observe prompt submission |
| `write(data)` | Inject keystrokes into the PTY |
| `run()` | Start session, resolve on exit |
| `stop()` | Kill the PTY process |
| `guardrail` | `EventSequenceGuardrail` for deterministic event verification |

Use `"*"` as tool name for wildcard matching. Listeners receive `HookRequest` with `toolName`, `toolInput`, and `payload`. All hooks return `{}` internally — listeners cannot send data back to the agent.

### Keystroke helpers

| Function | Output | Use case |
|---|---|---|
| `selectOptionByNumber(i)` | `"1"`–`"9"` | Select numbered menu option (0-indexed) |
| `navigateAndSelect(from, to)` | Arrow keys + Enter | Navigate to option and confirm |
| `toggleAndConfirm(from, indices)` | Arrows + Space + Enter | Multi-select toggle and confirm |
| `approveExitPlanMode()` | `"1"` | Approve plan |
| `rejectExitPlanMode()` | Escape | Reject plan |
| `typeMessage(text)` | `text` + Enter | Type text and submit |
| `approveToolPermission()` | `"y"` | Approve tool permission |
| `denyToolPermission()` | `"n"` | Deny tool permission |
| `arrowDown(n)` / `arrowUp(n)` | Arrow key × n | Raw navigation |
| `pressEnter()` / `pressSpace()` / `pressEscape()` | Single key | Raw keys |

### EventSequenceGuardrail

Wait for hook events with timeouts:

```typescript
const event = await session.guardrail.expect(
  { kind: "pre_tool_use", toolName: "Bash" },
  10_000,
);
```

### Timing model

`PreToolUse` and `Stop` hooks are **blocking** — Claude Code waits for them to complete. Keystrokes written to the PTY during a blocking hook callback buffer in the kernel and are consumed by the UI after the hook returns. `PermissionRequest` is **non-blocking** — the dialog renders in parallel with the hook.

## How it works

1. `run()` starts an HTTP server on a Unix domain socket (`/tmp/toll-free-<uuid>.sock`)
2. Writes hook configuration to `$HOME/.claude/settings.json`
3. Spawns the agent in a PTY with your args and prompt
4. Agent hooks call a bundled Node.js client that posts events to the socket
5. Your listeners observe events; you respond via `write()` keystrokes
6. On exit, the socket is cleaned up

**Warning:** `run()` overwrites `$HOME/.claude/settings.json` without backup. Use `env.HOME` to isolate:

```typescript
new ClaudeCodeSession({ ..., env: { HOME: "/tmp/isolated" } });
```

## Cross-platform

Uses Node.js `http.request({ socketPath })` for IPC — works on macOS, Linux, and Windows 10 1803+.

## License

Apache-2.0
