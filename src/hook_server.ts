import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { HookEvent, HookEventKind, HookHandler, HookRequest, HookResponse } from "./types.js";

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
  private handlers = new Map<string, HookHandler>();
  port = 0;

  setEventListener(fn: (event: HookEvent) => void): void {
    this.onEvent = fn;
  }

  setHandler(hookEventName: string, fn: HookHandler): void {
    this.handlers.set(hookEventName, fn);
  }

  async start(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error(`[hook-server] error: ${String(err)}`);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        });
      });
      this.server.on("connection", (socket) => {
        this.connections.add(socket);
        socket.on("close", () => this.connections.delete(socket));
      });
      this.server.on("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        if (typeof addr === "object" && addr !== null) {
          this.port = addr.port;
          resolve(addr.port);
        } else {
          reject(new Error("Failed to get server address"));
        }
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
      this.server.close(() => resolve());
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
