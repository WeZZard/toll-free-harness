# Migrating from `claude -p` to toll-free-harness

This guide shows how to convert scripts that use `claude -p` (with `--output-format json`, `--output-format stream-json`, or `--input-format stream-json`) to the toll-free-harness library API. Each section shows a Before (shell command) and After (TypeScript using toll-free-harness).

## 1. Simple prompt

### Before

```bash
claude -p "Fix the failing tests" --model opus
```

### After

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: process.cwd(),
  prompt: "Fix the failing tests",
});

const result = await session.run();
console.log(`Exit code: ${result.exitCode}`);
```

The `prompt` option replaces the positional argument to `claude -p`. Additional CLI flags go in `args`.

## 2. JSON output (`--output-format json`)

With `claude -p --output-format json`, you get a single JSON blob after the session finishes. The typical use is to capture what tools ran and the final result.

### Before

```bash
result=$(claude -p "Fix the failing tests" --output-format json)
echo "$result" | jq '.result'
```

### After

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const toolResults: Array<{ tool: string; input: unknown }> = [];

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: process.cwd(),
  prompt: "Fix the failing tests",
});

// Collect tool results as they complete (replaces parsing the JSON blob)
session.onPostToolUse("*", (event) => {
  toolResults.push({
    tool: event.toolName ?? "unknown",
    input: event.toolInput,
  });
});

// Capture the final stop event (replaces reading .result from the JSON)
let stopPayload: Record<string, unknown> = {};
session.onStop((payload) => {
  stopPayload = payload;
});

const result = await session.run();
console.log("Tools used:", toolResults);
console.log("Stop payload:", stopPayload);
console.log("Exit code:", result.exitCode);
```

Instead of parsing a JSON blob after the fact, you receive structured events as they happen through `onPostToolUse` and `onStop`.

## 3. Stream-json output (`--output-format stream-json`)

With `claude -p --output-format stream-json`, you get newline-delimited JSON events as the session runs. The typical use is to observe tool calls in real time.

### Before

```bash
claude -p "Refactor the auth module" --output-format stream-json | while read -r line; do
  type=$(echo "$line" | jq -r '.type')
  case "$type" in
    tool_use)
      tool=$(echo "$line" | jq -r '.tool')
      echo "Using tool: $tool"
      ;;
    tool_result)
      tool=$(echo "$line" | jq -r '.tool')
      echo "Tool done: $tool"
      ;;
    result)
      echo "Finished"
      ;;
  esac
done
```

### After

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: process.cwd(),
  prompt: "Refactor the auth module",
});

// Fires before each tool call (replaces stream-json tool_use events)
session.onPreToolUse("*", (event) => {
  console.log(`Using tool: ${event.toolName}`);
  if (event.toolName === "Bash") {
    console.log(`  Command: ${(event.toolInput as Record<string, unknown>)?.command}`);
  }
});

// Fires after each tool call (replaces stream-json tool_result events)
session.onPostToolUse("*", (event) => {
  console.log(`Tool done: ${event.toolName}`);
});

// Fires when the session ends (replaces stream-json result event)
session.onStop(() => {
  console.log("Finished");
});

const result = await session.run();
```

You can also filter listeners by tool name instead of matching on `"*"`:

```typescript
session.onPreToolUse("Bash", (event) => {
  console.log(`Running command: ${(event.toolInput as Record<string, unknown>)?.command}`);
});

session.onPreToolUse("Read", (event) => {
  console.log(`Reading file: ${(event.toolInput as Record<string, unknown>)?.file_path}`);
});
```

## 4. Stream-json input (`--input-format stream-json`)

With `claude -p --input-format stream-json`, you pipe structured messages into the agent and handle its questions and plan reviews programmatically.

### Before

```bash
# Pipe a prompt and handle conversation interactively
echo '{"type":"user","content":"Refactor the auth module"}' | \
  claude -p --input-format stream-json --output-format stream-json | \
  while read -r line; do
    type=$(echo "$line" | jq -r '.type')
    if [ "$type" = "ask_user_question" ]; then
      # Pick the first option
      echo '{"type":"user","content":"1"}'
    elif [ "$type" = "plan" ]; then
      # Approve the plan
      echo '{"type":"user","content":"yes"}'
    fi
  done
```

### After

```typescript
import { ClaudeCodeSession } from "toll-free-harness";

const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: process.cwd(),
  prompt: "Refactor the auth module",
});

// Handle the agent's questions (replaces parsing ask_user_question and sending a choice)
session.onAskUserQuestion(async (event) => {
  console.log(`Question: ${event.text}`);
  for (const q of event.questions) {
    console.log(`  Options: ${q.options.map((o) => o.label).join(", ")}`);
  }
  // Select the first option (0-indexed)
  return { selectedIndex: 0 };
});

// Handle plan review (replaces parsing plan events and sending yes/no)
session.onExitPlanMode(async (event) => {
  console.log(`Plan: ${event.planText.slice(0, 200)}...`);
  // Approve the plan
  return { decision: "approve" };
});

const result = await session.run();
```

To reject a plan and provide feedback:

```typescript
session.onExitPlanMode(async (event) => {
  if (event.planText.includes("delete")) {
    return { decision: "reject", feedback: "Do not delete any files." };
  }
  return { decision: "approve" };
});
```

To send follow-up prompts after the initial run:

```typescript
const session = new ClaudeCodeSession({
  args: ["--model", "opus"],
  cwd: process.cwd(),
  prompt: "Fix the failing tests",
});

session.onStop(() => {
  // Send a follow-up prompt when the first task finishes
  session.sendPrompt("Now add tests for the fix");
});

// sendPrompt also supports attaching images
session.sendPrompt("What does this UI look like?", {
  images: ["/tmp/screenshot.png"],
});
```

## 5. Feature comparison

| Capability | `claude -p` | toll-free-harness |
|---|---|---|
| Run a prompt | `claude -p "prompt"` | `new ClaudeCodeSession({ prompt })` then `session.run()` |
| Get final result | `--output-format json` | `session.onStop(callback)` |
| Stream tool events | `--output-format stream-json` | `session.onPreToolUse` / `session.onPostToolUse` |
| Answer questions | `--input-format stream-json` + manual parsing | `session.onAskUserQuestion(handler)` |
| Review plans | `--input-format stream-json` + manual parsing | `session.onExitPlanMode(handler)` |
| Send follow-up prompts | Not supported | `session.sendPrompt(text, options?)` |
| Attach images | Not supported | `session.sendPrompt(text, { images: [...] })` |
| Filter by tool name | Parse JSON and check `.tool` field | `session.onPreToolUse("Bash", callback)` |
| Wait for specific events | Manual loop over stream | `session.guardrail.expect({ kind, toolName }, timeout)` |
| Typed event payloads | Raw JSON | `AskUserQuestionEvent`, `ExitPlanModeEvent`, `HookRequest` |
| Permission observation | Parse stream events | `session.onPermissionRequest(toolName, callback)` |
| Multi-turn conversation | Requires external orchestration | Built-in via `sendPrompt` |

## 6. Installation

```bash
npm install toll-free-harness node-pty
```

Or with pnpm:

```bash
pnpm add toll-free-harness node-pty
```

`node-pty` is a peer dependency that provides the PTY (pseudo-terminal) used to spawn the agent. It requires a native build toolchain (Xcode command-line tools on macOS, build-essential on Linux).

## 7. Event guardrail for deterministic flows

If your `claude -p` script waited for specific tool calls before proceeding, use the guardrail API:

```typescript
// Wait for a specific tool call with a timeout
const event = await session.guardrail.expect(
  { kind: "pre_tool_use", toolName: "Bash" },
  10_000, // 10 second timeout
);
console.log("Bash tool was called:", event.payload);
```

This replaces patterns like:

```bash
claude -p "..." --output-format stream-json | while read -r line; do
  tool=$(echo "$line" | jq -r '.tool')
  if [ "$tool" = "Bash" ]; then
    echo "Got it"
    break
  fi
done
```
