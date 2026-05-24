import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let rl;

function reader() {
  rl ??= readline.createInterface({ input, output });
  return rl;
}

export async function prompt(label, defaultValue = "") {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await reader().question(`${label}${suffix}: `)).trim();
  return answer || defaultValue;
}

export async function promptValidated(label, defaultValue, validator, errorMessage) {
  while (true) {
    const answer = await prompt(label, defaultValue);
    if (validator(answer)) return answer;
    console.error(errorMessage);
  }
}

export function closePrompts() {
  rl?.close();
  rl = undefined;
}
