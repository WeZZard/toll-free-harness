import { describe, test, expect, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { JsonRpcTransport, JsonRpcTransportError } from "../../src/codex/protocol.js";

describe("JsonRpcTransport", () => {
  let serverOut: PassThrough;
  let serverIn: PassThrough;
  let transport: JsonRpcTransport;

  function setup(timeoutMs?: number): void {
    serverOut = new PassThrough();
    serverIn = new PassThrough();
    transport = new JsonRpcTransport(serverOut, serverIn, timeoutMs);
    transport.start();
  }

  afterEach(() => {
    transport?.dispose();
  });

  test("sendRequest writes JSONL with incremental ids", () => {
    setup();
    const written: string[] = [];
    serverIn.on("data", (chunk: Buffer) => {
      written.push(chunk.toString());
    });

    // Attach .catch to suppress unhandled rejections when dispose() clears pending
    transport.sendRequest("thread/start", { model: "gpt-4" }).catch(() => {});
    transport.sendRequest("turn/start", { input: "hello" }).catch(() => {});

    const lines = written.join("").trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    const second = JSON.parse(lines[1]!) as Record<string, unknown>;

    expect(first.method).toBe("thread/start");
    expect(first.id).toBe(0);
    expect((first.params as Record<string, unknown>).model).toBe("gpt-4");

    expect(second.method).toBe("turn/start");
    expect(second.id).toBe(1);
  });

  test("incoming response with matching id resolves promise", async () => {
    setup();
    const promise = transport.sendRequest("initialize", { clientInfo: {} });

    // Simulate server response
    serverOut.write(JSON.stringify({ id: 0, result: { ok: true } }) + "\n");

    const result = await promise;
    expect(result).toEqual({ ok: true });
  });

  test("incoming error response rejects promise", async () => {
    setup();
    const promise = transport.sendRequest("bad/method");

    serverOut.write(JSON.stringify({ id: 0, error: { code: -1, message: "not found" } }) + "\n");

    await expect(promise).rejects.toThrow(JsonRpcTransportError);
    await expect(promise).rejects.toThrow("not found");
  });

  test("incoming notification dispatches to handler", async () => {
    setup();
    const received: Record<string, unknown>[] = [];
    transport.onNotification("turn/completed", (params) => {
      received.push(params);
    });

    serverOut.write(JSON.stringify({ method: "turn/completed", params: { status: "completed" } }) + "\n");

    // Allow microtask to process
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0]!.status).toBe("completed");
  });

  test("server-initiated request routes to server request handler", async () => {
    setup();
    const received: Array<{ method: string; id: number | string; params: Record<string, unknown> }> = [];
    transport.onServerRequest((method, id, params) => {
      received.push({ method, id, params });
    });

    serverOut.write(JSON.stringify({
      method: "item/commandExecution/requestApproval",
      id: 100,
      params: { itemId: "abc", command: "ls" },
    }) + "\n");

    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0]!.method).toBe("item/commandExecution/requestApproval");
    expect(received[0]!.id).toBe(100);
    expect(received[0]!.params.itemId).toBe("abc");
  });

  test("request timeout rejects with JsonRpcTransportError", async () => {
    setup(50);
    const promise = transport.sendRequest("slow/method");

    // Do not send a response — let it time out
    await expect(promise).rejects.toThrow(JsonRpcTransportError);
    await expect(promise).rejects.toThrow("timed out");
  });

  test("dispose clears pending without unhandled rejections", async () => {
    setup();
    // Create pending requests that would normally timeout
    const p1 = transport.sendRequest("method/a").catch(() => "rejected");
    const p2 = transport.sendRequest("method/b").catch(() => "rejected");

    transport.dispose();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("rejected");
    expect(r2).toBe("rejected");
  });
});
