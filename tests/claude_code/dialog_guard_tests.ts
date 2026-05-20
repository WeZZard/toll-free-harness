import { describe, expect, test, vi } from "vitest";
import { DialogGuard } from "../../src/claude_code/dialog_guard.js";

function mockPty() {
  const dataCallbacks: Array<(data: string) => void> = [];
  const written: string[] = [];
  return {
    pty: {
      onData: vi.fn((cb: (data: string) => void) => {
        dataCallbacks.push(cb);
        return { dispose: vi.fn(() => { dataCallbacks.length = 0; }) };
      }),
      write: vi.fn((data: string) => written.push(data)),
    } as any,
    emit(data: string) { dataCallbacks.forEach(cb => cb(data)); },
    written,
  };
}

describe("DialogGuard", () => {
  test("handler fires on trigger and sends keystroke", () => {
    const guard = new DialogGuard();
    const mock = mockPty();
    guard.addHandler("trust", "\r");
    guard.attach(mock.pty);
    mock.emit("Do you trust this folder?");
    expect(mock.written).toEqual(["\r"]);
  });

  test("handler fires only once", () => {
    const guard = new DialogGuard();
    const mock = mockPty();
    guard.addHandler("trust", "\r");
    guard.attach(mock.pty);
    mock.emit("trust");
    mock.emit("trust again");
    expect(mock.written).toEqual(["\r"]);
  });

  test("multiple handlers fire independently", () => {
    const guard = new DialogGuard();
    const mock = mockPty();
    guard.addHandler("trust", "\r");
    guard.addHandler("accept", "2");
    guard.attach(mock.pty);
    mock.emit("trust this");
    mock.emit("I accept");
    expect(mock.written).toEqual(["\r", "2"]);
  });

  test("deactivate clears handlers and disposes listener", () => {
    const guard = new DialogGuard();
    const mock = mockPty();
    guard.addHandler("trust", "\r");
    guard.attach(mock.pty);
    guard.deactivate();
    mock.emit("trust");
    expect(mock.written).toEqual([]);
  });

  test("no handlers means no keystrokes", () => {
    const guard = new DialogGuard();
    const mock = mockPty();
    guard.attach(mock.pty);
    mock.emit("trust");
    mock.emit("accept");
    expect(mock.written).toEqual([]);
  });
});
