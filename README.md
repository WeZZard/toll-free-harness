# toll-free-harness

Full-featured user interaction simulator for terminal-based coding agents.

`toll-free-harness` models the complete user interaction surface of a coding agent CLI — prompting, answering questions, reviewing plans — as typed APIs. It spawns the agent in a local PTY, observes events through read-only hooks, and responds through the same keystroke channel a real user would.

Currently supports **Claude Code**. The framework is designed to add support for other coding agents whose headless modes do not fully expose the interactive user experience.

The name is a joke about toll booths around developer workflows.

## What this project is not

Not an API proxy, credential-sharing service, or billing workaround. Users run their own local tools with their own accounts and must comply with those tools' terms.

## Install

```bash
pnpm add toll-free-harness node-pty
```

## Quick start

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: "/path/to/project",
  prompt: "Fix the failing tests",
});

// Handle the agent's questions — return which option to select
session.onAskUserQuestion(async (event) => {
  console.log(event.text);
  console.log(event.questions[0]?.options.map((o, i) => `${i}: ${o.label}`));
  return { selectedIndex: 0 };
});

// Handle plan review — approve or reject with feedback
session.onExitPlanMode(async (event) => {
  console.log(event.planText.slice(0, 200));
  return { decision: "approve" };
});

const result = await session.run();

// Send a follow-up prompt (with optional images)
session.sendPrompt("Now add tests for the fix", {
  images: ["/tmp/screenshot.png"],
});
```

## User interactions

The framework models three user interactions as dedicated typed APIs:

| Interaction | API | You provide | Library does |
|---|---|---|---|
| **Prompting** | `sendPrompt(text, options?)` | Text + optional image paths | Injects keystrokes into PTY |
| **Answering questions** | `onAskUserQuestion(handler)` | `{ selectedIndex }` | Navigates and selects the option |
| **Reviewing plans** | `onExitPlanMode(handler)` | `{ decision: "approve" }` or `{ decision: "reject", feedback }` | Approves or rejects via keystrokes |

There is no raw `write()` — the library translates your typed decisions into the correct keystrokes internally.

## Hook listeners (read-only)

Observe agent events without sending data back:

```typescript
session.onPreToolUse("Bash", (event) => {
  console.log(`Running: ${event.toolInput?.command}`);
});

session.onPostToolUse("*", (event) => {
  console.log(`Tool ${event.toolName} completed`);
});

session.onStop(() => {
  console.log("Session ended");
});
```

Available: `onPreToolUse`, `onPostToolUse`, `onPermissionRequest`, `onStop`, `onUserPromptSubmit`. All are read-only — hooks return `{}` internally and never send data back to the agent.

## Event guardrail

Wait for specific events with timeouts for deterministic test flows:

```typescript
const event = await session.guardrail.expect(
  { kind: "pre_tool_use", toolName: "Bash" },
  10_000,
);
```

## Timing model

`PreToolUse` and `Stop` hooks are **blocking** — the agent waits for them. Keystrokes injected during a blocking hook callback buffer in PTY stdin and are consumed by the UI after the hook returns. `PermissionRequest` is **non-blocking** — the dialog renders in parallel.

## How it works

1. `run()` generates a temporary plugin in `/tmp/toll-free-plugin-<uuid>/` containing a manifest, hook definitions, and a bundled hook client
2. Starts an HTTP server on a Unix domain socket (`/tmp/toll-free-<uuid>.sock`)
3. Spawns the agent in a PTY with `--plugin-dir /tmp/toll-free-plugin-<uuid>/` plus your args and prompt
4. The agent loads the plugin and fires hooks as it runs. The hook client posts events to the socket.
5. Your interaction handlers and listeners receive events; responses go through PTY keystrokes
6. On exit, the socket and plugin directory are cleaned up

No user-scope settings are modified. The plugin is self-contained and session-scoped.

## Cross-platform

Uses Node.js `http.request({ socketPath })` for IPC — works on macOS, Linux, and Windows 10 1803+.

## License

Apache-2.0
