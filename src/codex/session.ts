import { spawn, type ChildProcess } from "node:child_process";
import { EventSequenceGuardrail } from "../core/guardrail.js";
import type { HookEvent } from "../core/types.js";
import { JsonRpcTransport } from "./protocol.js";
import type {
  CodexThreadConfig,
  CodexTurnResult,
  ApprovalHandler,
  ApprovalRequest,
  NotificationHandler,
} from "./types.js";

export class CodexSession {
  private process: ChildProcess | undefined;
  private transport: JsonRpcTransport | undefined;
  private _guardrail = new EventSequenceGuardrail();

  private approvalHandler: ApprovalHandler | undefined;
  private notificationHandlers = new Map<string, NotificationHandler>();

  constructor(readonly config: CodexThreadConfig) {}

  onApproval(handler: ApprovalHandler): this {
    this.approvalHandler = handler;
    return this;
  }

  onTurnCompleted(handler: NotificationHandler): this {
    this.notificationHandlers.set("turn/completed", handler);
    return this;
  }

  onItemStarted(handler: NotificationHandler): this {
    this.notificationHandlers.set("item/started", handler);
    return this;
  }

  onItemCompleted(handler: NotificationHandler): this {
    this.notificationHandlers.set("item/completed", handler);
    return this;
  }

  onAgentMessageDelta(handler: NotificationHandler): this {
    this.notificationHandlers.set("item/agentMessage/delta", handler);
    return this;
  }

  onCommandOutputDelta(handler: NotificationHandler): this {
    this.notificationHandlers.set("item/commandExecution/outputDelta", handler);
    return this;
  }

  get guardrail(): EventSequenceGuardrail {
    return this._guardrail;
  }

  async run(prompt: string): Promise<CodexTurnResult> {
    const bin = this.config.bin ?? "codex";
    const proc = spawn(bin, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.process = proc;

    const stdout = proc.stdout;
    const stdin = proc.stdin;
    if (!stdout || !stdin) {
      throw new Error("Failed to open stdio pipes to codex app-server");
    }

    this.transport = new JsonRpcTransport(stdout, stdin);
    this.transport.start();

    const items: Array<Record<string, unknown>> = [];
    let turnResult: CodexTurnResult | undefined;

    try {
      // Initialize the session
      await this.transport.sendRequest("initialize", {
        clientInfo: { name: "toll-free-harness", version: "0.1.0" },
      });
      this.transport.sendNotification("initialized");

      // Start a thread with config
      const threadParams: Record<string, unknown> = {};
      if (this.config.model !== undefined) threadParams.model = this.config.model;
      if (this.config.cwd !== undefined) threadParams.cwd = this.config.cwd;
      if (this.config.approvalPolicy !== undefined) threadParams.approvalPolicy = this.config.approvalPolicy;
      if (this.config.sandbox !== undefined) threadParams.sandbox = this.config.sandbox;

      await this.transport.sendRequest("thread/start", threadParams);

      // Register server request handler for approval requests
      this.transport.onServerRequest((method, id, params) => {
        void this.handleServerRequest(method, id, params);
      });

      // Register notification handlers
      const turnCompleted = new Promise<void>((resolve) => {
        this.transport!.onNotification("turn/started", (params) => {
          this.pushGuardrailEvent("pre_tool_use", params);
          this.notificationHandlers.get("turn/started")?.(params);
        });

        this.transport!.onNotification("turn/completed", (params) => {
          this.pushGuardrailEvent("stop", params);
          this.notificationHandlers.get("turn/completed")?.(params);
          if ("status" in params) {
            turnResult = {
              status: params.status as CodexTurnResult["status"],
              items,
            };
          }
          resolve();
        });

        this.transport!.onNotification("item/started", (params) => {
          this.notificationHandlers.get("item/started")?.(params);
        });

        this.transport!.onNotification("item/completed", (params) => {
          items.push(params);
          this.notificationHandlers.get("item/completed")?.(params);
        });

        this.transport!.onNotification("item/agentMessage/delta", (params) => {
          this.notificationHandlers.get("item/agentMessage/delta")?.(params);
        });

        this.transport!.onNotification("item/commandExecution/outputDelta", (params) => {
          this.notificationHandlers.get("item/commandExecution/outputDelta")?.(params);
        });
      });

      // Start the turn with the prompt
      await this.transport.sendRequest("turn/start", { input: [{ type: "text", text: prompt }] });

      // Wait for turn completion
      await turnCompleted;

      return turnResult ?? { status: "completed", items };
    } finally {
      this.transport?.dispose();
      this._guardrail.dispose();
      if (this.process) {
        this.process.kill();
        this.process = undefined;
      }
    }
  }

  stop(): void {
    this.transport?.dispose();
    this._guardrail.dispose();
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  private async handleServerRequest(method: string, id: number | string, params: Record<string, unknown>): Promise<void> {
    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval"
    ) {
      const kind = method === "item/commandExecution/requestApproval"
        ? "commandExecution" as const
        : "fileChange" as const;

      const request: ApprovalRequest = {
        itemId: params.itemId as string,
        threadId: params.threadId as string,
        turnId: params.turnId as string,
        kind,
        payload: params,
      };
      if (params.command !== undefined) request.command = params.command as string;
      if (params.reason !== undefined) request.reason = params.reason as string;

      if (this.approvalHandler) {
        const decision = await this.approvalHandler(request);
        this.transport?.sendResponse(id, decision as unknown as Record<string, unknown>);
      } else {
        // Default: accept
        this.transport?.sendResponse(id, { accept: true });
      }
    }
  }

  private pushGuardrailEvent(kind: HookEvent["kind"], params: Record<string, unknown>): void {
    this._guardrail.push({
      kind,
      payload: params,
      receivedAt: Date.now(),
    });
  }
}
