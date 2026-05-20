import { createInterface } from "node:readline";
import type { Writable, Readable } from "node:stream";

export class JsonRpcTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRpcTransportError";
  }
}

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class JsonRpcTransport {
  private nextId = 0;
  private pending = new Map<number | string, PendingRequest>();
  private notificationHandlers = new Map<string, (params: Record<string, unknown>) => void>();
  private serverRequestHandler: ((method: string, id: number | string, params: Record<string, unknown>) => void) | undefined;
  private rl?: ReturnType<typeof createInterface>;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly requestTimeoutMs = 30_000,
  ) {}

  start(): void {
    this.rl = createInterface({ input: this.input });
    this.rl.on("line", (line: string) => {
      this.handleLine(line);
    });
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const message: Record<string, unknown> = { method, id };
    if (params !== undefined) {
      message.params = params;
    }
    this.writeLine(message);

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonRpcTransportError(`Request ${method} (id=${id}) timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  sendNotification(method: string, params?: Record<string, unknown>): void {
    const message: Record<string, unknown> = { method };
    if (params !== undefined) {
      message.params = params;
    }
    this.writeLine(message);
  }

  sendResponse(id: number | string, result: Record<string, unknown>): void {
    this.writeLine({ id, result });
  }

  onNotification(method: string, handler: (params: Record<string, unknown>) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  onServerRequest(handler: (method: string, id: number | string, params: Record<string, unknown>) => void): void {
    this.serverRequestHandler = handler;
  }

  dispose(): void {
    this.rl?.close();
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new JsonRpcTransportError("Transport disposed"));
    }
    this.pending.clear();
    this.notificationHandlers.clear();
    this.serverRequestHandler = undefined;
  }

  private writeLine(message: Record<string, unknown>): void {
    this.output.write(JSON.stringify(message) + "\n");
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    const hasId = "id" in parsed;
    const hasMethod = "method" in parsed;
    const hasResult = "result" in parsed;
    const hasError = "error" in parsed;

    // Response: has id + result
    if (hasId && hasResult) {
      const id = parsed.id as number | string;
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.resolve(parsed.result as Record<string, unknown>);
      }
      return;
    }

    // Error response: has id + error
    if (hasId && hasError) {
      const id = parsed.id as number | string;
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        const err = parsed.error as Record<string, unknown>;
        pending.reject(new JsonRpcTransportError(
          `RPC error ${err.code ?? "unknown"}: ${err.message ?? "unknown error"}`,
        ));
      }
      return;
    }

    // Server-initiated request: has method + id (no result/error)
    if (hasMethod && hasId) {
      this.serverRequestHandler?.(
        parsed.method as string,
        parsed.id as number | string,
        (parsed.params ?? {}) as Record<string, unknown>,
      );
      return;
    }

    // Notification: has method, no id
    if (hasMethod && !hasId) {
      const method = parsed.method as string;
      const handler = this.notificationHandlers.get(method);
      handler?.((parsed.params ?? {}) as Record<string, unknown>);
      return;
    }
  }
}
