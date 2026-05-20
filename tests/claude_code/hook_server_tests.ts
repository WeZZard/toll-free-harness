import { afterEach, describe, expect, test } from "vitest";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { HookServer } from "../../src/claude_code/hook_server.js";
import type { HookEvent } from "../../src/core/types.js";

function postToSocket(socketPath: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = httpRequest(
      { socketPath, path: "/hook", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

describe("HookServer", () => {
  let server: HookServer;
  let sockPath: string;

  afterEach(async () => {
    await server?.stop();
  });

  function newSocketPath(): string {
    sockPath = path.join(tmpdir(), `test-hook-${randomUUID()}.sock`);
    return sockPath;
  }

  test("start() returns socket path and stop() cleans up", async () => {
    server = new HookServer();
    const result = await server.start(newSocketPath());
    expect(result).toBe(sockPath);
    await server.stop();
  });

  test("POST JSON fires event listener with correct kind and toolName", async () => {
    server = new HookServer();
    await server.start(newSocketPath());

    const received: HookEvent[] = [];
    server.setEventListener((event) => received.push(event));

    await postToSocket(sockPath, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.kind).toBe("pre_tool_use");
    expect(received[0]!.toolName).toBe("Bash");
  });

  test("handler set for event name returns handler response", async () => {
    server = new HookServer();
    await server.start(newSocketPath());

    server.setHandler("PreToolUse", async () => ({
      hookSpecificOutput: { permissionDecision: "deny" },
    }));

    const json = await postToSocket(sockPath, { hook_event_name: "PreToolUse" });
    expect(json).toEqual({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  });

  test("no handler returns empty JSON response", async () => {
    server = new HookServer();
    await server.start(newSocketPath());

    const json = await postToSocket(sockPath, { hook_event_name: "PostToolUse" });
    expect(json).toEqual({});
  });

  test("event kind mapping (PreToolUse, PostToolUse, PermissionRequest, Stop)", async () => {
    server = new HookServer();
    await server.start(newSocketPath());

    const received: HookEvent[] = [];
    server.setEventListener((event) => received.push(event));

    for (const name of ["PreToolUse", "PostToolUse", "PermissionRequest", "Stop"]) {
      await postToSocket(sockPath, { hook_event_name: name });
    }

    expect(received.map((e) => e.kind)).toEqual([
      "pre_tool_use",
      "post_tool_use",
      "permission_request",
      "stop",
    ]);
  });
});
