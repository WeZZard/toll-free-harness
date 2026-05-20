export interface ClaudeCodeAdaptedArgs {
  printMode: boolean;
  prompt: string | undefined;
  inputFormat: string | undefined;
  outputFormat: string | undefined;
  remainingArgs: string[];
}

export function adaptClaudeCodeArgs(argv: string[]): ClaudeCodeAdaptedArgs {
  const tokens = [...argv];
  let printMode = false;
  let inputFormat: string | undefined;
  let outputFormat: string | undefined;

  // Pass 1: extract -p / --print
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "-p" || tokens[i] === "--print") {
      printMode = true;
      tokens.splice(i, 1);
    }
  }

  // Pass 2: extract --output-format <value>
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (tokens[i] === "--output-format") {
      outputFormat = tokens[i + 1];
      tokens.splice(i, 2);
      break;
    }
  }

  // Pass 3: extract --input-format <value>
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (tokens[i] === "--input-format") {
      inputFormat = tokens[i + 1];
      tokens.splice(i, 2);
      break;
    }
  }

  // Pass 4: find prompt (first non-flag positional token)
  let prompt: string | undefined;
  let promptIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.startsWith("--")) {
      // Long flag — skip its value if the next token doesn't look like a flag
      if (i + 1 < tokens.length && !tokens[i + 1]!.startsWith("-")) {
        i++;
      }
      continue;
    }
    if (token.startsWith("-") && token.length === 2) {
      // Short boolean flag (e.g., -c, -r)
      continue;
    }
    // Positional token — this is the prompt
    prompt = token;
    promptIndex = i;
    break;
  }

  const remainingArgs = promptIndex >= 0
    ? [...tokens.slice(0, promptIndex), ...tokens.slice(promptIndex + 1)]
    : [...tokens];

  return { printMode, prompt, inputFormat, outputFormat, remainingArgs };
}
