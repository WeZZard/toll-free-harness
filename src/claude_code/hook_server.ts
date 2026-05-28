import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { unlink } from "node:fs/promises";
import type { HookEvent, HookEventKind } from "../core/types.js";
import type { HookRequest } from "./types.js";

type HookResponse = Record<string, unknown>;
type HookResponseFn = (request: HookRequest) => Promise<HookResponse>;

function mapEventKind(hookEventName: string): HookEventKind {
  switch (hookEventName) {
    case "PreToolUse": return "pre_tool_use";
    case "PostToolUse": return "post_tool_use";
    case "PermissionRequest": return "permission_request";
    case "UserPromptSubmit": return "user_prompt_submit";
    case "Stop": return "stop";
    default: return "pre_tool_use";
  }
}

export class HookServer {
  private server: Server | undefined;
  private connections = new Set<Socket>();
  private onEvent: ((event: HookEvent) => void) | undefined;
  private handlers = new Map<string, HookResponseFn>();
  socketPath: string | undefined;

  setEventListener(fn: (event: HookEvent) => void): void {
    this.onEvent = fn;
  }

  setHandler(hookEventName: string, fn: HookResponseFn): void {
    this.handlers.set(hookEventName, fn);
  }

  async start(socketPath: string): Promise<string> {
    await unlink(socketPath).catch(() => {});
    this.socketPath = socketPath;
    return new Promise<string>((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error(`[hook-server] error: ${String(err)}`);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        });
      });
      this.server.on("connection", (socket) => {
        this.connections.add(socket);
        console.error(`[tfh-debug] hook-server connection accepted (n=${this.connections.size})`);
        socket.on("close", () => this.connections.delete(socket));
      });
      this.server.on("error", reject);
      this.server.listen(socketPath, () => {
        resolve(socketPath);
      });
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    return new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(async () => {
        if (this.socketPath) {
          await unlink(this.socketPath).catch(() => {});
        }
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const parsed: Record<string, unknown> = JSON.parse(body);

    const hookEventName = String(parsed.hook_event_name ?? "");
    const toolName = typeof parsed.tool_name === "string" ? parsed.tool_name : undefined;
    const toolInput = typeof parsed.tool_input === "object" && parsed.tool_input !== null
      ? parsed.tool_input as Record<string, unknown>
      : undefined;

    const hookRequest: HookRequest = {
      hookEventName,
      payload: parsed,
    };
    if (toolName) hookRequest.toolName = toolName;
    if (toolInput) hookRequest.toolInput = toolInput;

    const event: HookEvent = {
      kind: mapEventKind(hookEventName),
      payload: parsed,
      receivedAt: Date.now(),
    };
    if (toolName) event.toolName = toolName;
    this.onEvent?.(event);

    const handler = this.handlers.get(hookEventName);
    if (handler) {
      const response: HookResponse = await handler(hookRequest);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
