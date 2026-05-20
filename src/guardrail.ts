import type { HookEvent, HookEventKind, ExpectedEvent } from "./types.js";

export class GuardrailTimeoutError extends Error {
  constructor(
    readonly expected: ExpectedEvent,
    readonly timeoutMs: number,
  ) {
    super(`Guardrail timeout: expected ${expected.kind}${expected.toolName ? ` for ${expected.toolName}` : ""} within ${timeoutMs}ms`);
    this.name = "GuardrailTimeoutError";
  }
}

export class EventSequenceGuardrail {
  private waiters: Array<{
    expected: ExpectedEvent;
    resolve: (event: HookEvent) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  push(event: HookEvent): void {
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i]!;
      if (this.matches(event, waiter.expected)) {
        clearTimeout(waiter.timer);
        this.waiters.splice(i, 1);
        waiter.resolve(event);
        return;
      }
    }
  }

  expect(expected: ExpectedEvent, timeoutMs: number): Promise<HookEvent> {
    return new Promise<HookEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
        reject(new GuardrailTimeoutError(expected, timeoutMs));
      }, timeoutMs);
      this.waiters.push({ expected, resolve, reject, timer });
    });
  }

  expectAny(kinds: HookEventKind[], timeoutMs: number): Promise<HookEvent> {
    return new Promise<HookEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        for (const r of resolvers) {
          const idx = this.waiters.findIndex((w) => w.resolve === r);
          if (idx !== -1) this.waiters.splice(idx, 1);
        }
        reject(new GuardrailTimeoutError({ kind: kinds[0]! }, timeoutMs));
      }, timeoutMs);
      const resolvers: Array<(event: HookEvent) => void> = [];
      for (const kind of kinds) {
        const waiterResolve = (event: HookEvent): void => {
          clearTimeout(timer);
          for (const r of resolvers) {
            if (r === waiterResolve) continue;
            const idx = this.waiters.findIndex((w) => w.resolve === r);
            if (idx !== -1) this.waiters.splice(idx, 1);
          }
          resolve(event);
        };
        resolvers.push(waiterResolve);
        this.waiters.push({ expected: { kind }, resolve: waiterResolve, reject, timer });
      }
    });
  }

  dispose(): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
    }
    this.waiters = [];
  }

  private matches(event: HookEvent, expected: ExpectedEvent): boolean {
    if (event.kind !== expected.kind) return false;
    if (expected.toolName && event.toolName !== expected.toolName) return false;
    return true;
  }
}
