import { afterEach, describe, expect, test } from "vitest";
import { EventSequenceGuardrail, GuardrailTimeoutError } from "../../src/core/guardrail.js";
import type { HookEvent } from "../../src/core/types.js";

describe("EventSequenceGuardrail", () => {
  let guardrail: EventSequenceGuardrail;

  afterEach(() => {
    guardrail?.dispose();
  });

  test("expect() resolves when matching event is pushed", async () => {
    guardrail = new EventSequenceGuardrail();
    const promise = guardrail.expect({ kind: "pre_tool_use" }, 1000);

    const event: HookEvent = {
      kind: "pre_tool_use",
      payload: {},
      receivedAt: Date.now(),
    };
    guardrail.push(event);

    const result = await promise;
    expect(result.kind).toBe("pre_tool_use");
  });

  test("expect() rejects with GuardrailTimeoutError after timeout", async () => {
    guardrail = new EventSequenceGuardrail();
    const promise = guardrail.expect({ kind: "stop" }, 50);

    await expect(promise).rejects.toThrow(GuardrailTimeoutError);
  });

  test("expect() with toolName only matches that toolName", async () => {
    guardrail = new EventSequenceGuardrail();
    const promise = guardrail.expect({ kind: "pre_tool_use", toolName: "Bash" }, 1000);

    // Push event with wrong toolName — should not resolve
    guardrail.push({
      kind: "pre_tool_use",
      toolName: "Read",
      payload: {},
      receivedAt: Date.now(),
    });

    // Push event with correct toolName — should resolve
    guardrail.push({
      kind: "pre_tool_use",
      toolName: "Bash",
      payload: {},
      receivedAt: Date.now(),
    });

    const result = await promise;
    expect(result.toolName).toBe("Bash");
  });

  test("expectAny() resolves when any listed kind arrives", async () => {
    guardrail = new EventSequenceGuardrail();
    const promise = guardrail.expectAny(["pre_tool_use", "stop"], 1000);

    guardrail.push({
      kind: "stop",
      payload: {},
      receivedAt: Date.now(),
    });

    const result = await promise;
    expect(result.kind).toBe("stop");
  });

  test("dispose() clears pending timers without unhandled rejections", () => {
    guardrail = new EventSequenceGuardrail();
    // Create a pending expectation that would timeout
    void guardrail.expect({ kind: "pre_tool_use" }, 5000);
    // dispose() should clear it without any unhandled rejection
    guardrail.dispose();
  });

  test("push before expect does not satisfy later expect", async () => {
    guardrail = new EventSequenceGuardrail();

    // Push an event before anyone is waiting
    guardrail.push({
      kind: "pre_tool_use",
      payload: {},
      receivedAt: Date.now(),
    });

    // A subsequent expect should timeout because the event was already consumed/dropped
    const promise = guardrail.expect({ kind: "pre_tool_use" }, 50);
    await expect(promise).rejects.toThrow(GuardrailTimeoutError);
  });
});
