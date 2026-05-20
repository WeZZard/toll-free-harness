export function selectOptionByNumber(optionIndex: number): string {
  const oneIndexed = optionIndex + 1;
  if (oneIndexed < 1 || oneIndexed > 9) {
    throw new Error(`Option index ${optionIndex} out of range for number-key selection (0-8)`);
  }
  return String(oneIndexed);
}

export function approveExitPlanMode(): string {
  return "1";
}

export function rejectExitPlanMode(): string {
  return "\x1b";
}

export function typeMessage(text: string): string {
  return `${text}\r`;
}
