const ARROW_DOWN = "\x1b[B";
const ARROW_UP = "\x1b[A";
const ENTER = "\r";
const SPACE = " ";
const ESCAPE = "\x1b";

export function arrowDown(count = 1): string {
  return ARROW_DOWN.repeat(count);
}

export function arrowUp(count = 1): string {
  return ARROW_UP.repeat(count);
}

export function pressEnter(): string {
  return ENTER;
}

export function pressSpace(): string {
  return SPACE;
}

export function pressEscape(): string {
  return ESCAPE;
}

export function selectOptionByNumber(optionIndex: number): string {
  const oneIndexed = optionIndex + 1;
  if (oneIndexed < 1 || oneIndexed > 9) {
    throw new Error(`Option index ${optionIndex} out of range for number-key selection (0-8)`);
  }
  return String(oneIndexed);
}

export function navigateAndSelect(fromIndex: number, toIndex: number): string {
  const diff = toIndex - fromIndex;
  if (diff === 0) return ENTER;
  if (diff > 0) return arrowDown(diff) + ENTER;
  return arrowUp(-diff) + ENTER;
}

export function toggleAndConfirm(fromIndex: number, targetIndices: number[]): string {
  const sorted = [...targetIndices].sort((a, b) => a - b);
  let keys = "";
  let current = fromIndex;
  for (const target of sorted) {
    const diff = target - current;
    if (diff > 0) keys += arrowDown(diff);
    else if (diff < 0) keys += arrowUp(-diff);
    keys += SPACE;
    current = target;
  }
  keys += ENTER;
  return keys;
}

export function approveExitPlanMode(): string {
  return "1";
}

export function rejectExitPlanMode(): string {
  return ESCAPE;
}

export function typeMessage(text: string): string {
  return `${text}${ENTER}`;
}

export function approveToolPermission(): string {
  return "y";
}

export function denyToolPermission(): string {
  return "n";
}
