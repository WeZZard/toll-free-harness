import { afterEach, describe, expect, test } from "vitest";
import { HookServer } from "../src/hook_server.js";
import type { HookEvent } from "../src/types.js";

describe("HookServer", () => {
  let server: HookServer;

  afterEach(async () => {
    await server?.stop();
  });

  test("start() returns a port and stop() cleans up", async () => {
    server = new HookServer();
    const port = await server.start();
    expect(port).toBeGreaterThan(0);
    await server.stop();
  });

  test("POST JSON fires event listener with correct kind and toolName", async () => {
    server = new HookServer();
    const port = await server.start();

    const received: HookEvent[] = [];
    server.setEventListener((event) => received.push(event));

    await fetch(`http://127.0.0.1:${port}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
      }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.kind).toBe("pre_tool_use");
    expect(received[0]!.toolName).toBe("Bash");
  });

  test("handler set for event name returns handler response", async () => {
    server = new HookServer();
    const port = await server.start();

    server.setHandler("PreToolUse", async () => ({
      hookSpecificOutput: { permissionDecision: "deny" },
    }));

    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook_event_name: "PreToolUse" }),
    });

    const json = await response.json();
    expect(json).toEqual({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  });

  test("no handler returns empty JSON response", async () => {
    server = new HookServer();
    const port = await server.start();

    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook_event_name: "PostToolUse" }),
    });

    const json = await response.json();
    expect(json).toEqual({});
  });

  test("event kind mapping (PreToolUse, PostToolUse, PermissionRequest, Stop)", async () => {
    server = new HookServer();
    const port = await server.start();

    const received: HookEvent[] = [];
    server.setEventListener((event) => received.push(event));

    const hookEventNames = ["PreToolUse", "PostToolUse", "PermissionRequest", "Stop"];
    for (const name of hookEventNames) {
      await fetch(`http://127.0.0.1:${port}/hook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook_event_name: name }),
      });
    }

    expect(received.map((e) => e.kind)).toEqual([
      "pre_tool_use",
      "post_tool_use",
      "permission_request",
      "stop",
    ]);
  });
});
