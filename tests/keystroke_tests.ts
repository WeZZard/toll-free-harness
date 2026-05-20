import { describe, expect, test } from "vitest";
import { selectOptionByNumber, approveExitPlanMode, rejectExitPlanMode, typeMessage } from "../src/keystroke.js";

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
