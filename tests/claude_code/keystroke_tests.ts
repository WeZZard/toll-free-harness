import { describe, expect, test } from "vitest";
import {
  arrowDown,
  arrowUp,
  pressEnter,
  pressSpace,
  pressEscape,
  selectOptionByNumber,
  navigateAndSelect,
  toggleAndConfirm,
  approveExitPlanMode,
  rejectExitPlanMode,
  typeMessage,
  approveToolPermission,
  denyToolPermission,
} from "../../src/claude_code/keystroke.js";

describe("arrowDown", () => {
  test("returns one arrow-down by default", () => {
    expect(arrowDown()).toBe("\x1b[B");
  });

  test("repeats for count", () => {
    expect(arrowDown(3)).toBe("\x1b[B\x1b[B\x1b[B");
  });
});

describe("arrowUp", () => {
  test("returns one arrow-up by default", () => {
    expect(arrowUp()).toBe("\x1b[A");
  });

  test("repeats for count", () => {
    expect(arrowUp(2)).toBe("\x1b[A\x1b[A");
  });
});

describe("pressEnter / pressSpace / pressEscape", () => {
  test("pressEnter returns carriage return", () => {
    expect(pressEnter()).toBe("\r");
  });

  test("pressSpace returns space", () => {
    expect(pressSpace()).toBe(" ");
  });

  test("pressEscape returns ESC", () => {
    expect(pressEscape()).toBe("\x1b");
  });
});

describe("selectOptionByNumber", () => {
  test("maps 0-indexed option to 1-indexed key string", () => {
    expect(selectOptionByNumber(0)).toBe("1");
    expect(selectOptionByNumber(4)).toBe("5");
    expect(selectOptionByNumber(8)).toBe("9");
  });

  test("throws for negative index", () => {
    expect(() => selectOptionByNumber(-1)).toThrow();
  });

  test("throws for index 9 (out of range)", () => {
    expect(() => selectOptionByNumber(9)).toThrow();
  });
});

describe("navigateAndSelect", () => {
  test("same index returns just Enter", () => {
    expect(navigateAndSelect(0, 0)).toBe("\r");
  });

  test("navigates down then Enter", () => {
    expect(navigateAndSelect(0, 2)).toBe("\x1b[B\x1b[B\r");
  });

  test("navigates up then Enter", () => {
    expect(navigateAndSelect(3, 1)).toBe("\x1b[A\x1b[A\r");
  });
});

describe("toggleAndConfirm", () => {
  test("toggles single option and confirms", () => {
    expect(toggleAndConfirm(0, [2])).toBe("\x1b[B\x1b[B \r");
  });

  test("toggles multiple options in order", () => {
    const result = toggleAndConfirm(0, [1, 3]);
    expect(result).toBe("\x1b[B \x1b[B\x1b[B \r");
  });

  test("sorts indices before navigating", () => {
    const result = toggleAndConfirm(0, [3, 1]);
    expect(result).toBe("\x1b[B \x1b[B\x1b[B \r");
  });
});

describe("approveExitPlanMode", () => {
  test("returns '1'", () => {
    expect(approveExitPlanMode()).toBe("1");
  });
});

describe("rejectExitPlanMode", () => {
  test("returns ESC character", () => {
    expect(rejectExitPlanMode()).toBe("\x1b");
  });
});

describe("typeMessage", () => {
  test("appends carriage return to text", () => {
    expect(typeMessage("hello")).toBe("hello\r");
  });

  test("returns bare carriage return for empty string", () => {
    expect(typeMessage("")).toBe("\r");
  });
});

describe("approveToolPermission / denyToolPermission", () => {
  test("approveToolPermission returns 'y'", () => {
    expect(approveToolPermission()).toBe("y");
  });

  test("denyToolPermission returns 'n'", () => {
    expect(denyToolPermission()).toBe("n");
  });
});
