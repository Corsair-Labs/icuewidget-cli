import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let rl;

function reader() {
  rl ??= readline.createInterface({ input, output });
  return rl;
}

export async function prompt(label, defaultValue = "") {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await ask(`${label}${suffix}: `, label)).trim();
  return answer || defaultValue;
}

// readline never settles a pending question when stdin ends (closed pipe, CI, /dev/null), so
// Node would exit 0 with the command half-run. Reject instead so the failure is visible.
function ask(question, label) {
  const rl = reader();
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error(`Input ended while waiting for "${label}". Pass the value as a flag or run interactively.`));
    rl.once("close", onClose);
    rl.question(question).then(
      (answer) => {
        rl.off("close", onClose);
        resolve(answer);
      },
      (error) => {
        rl.off("close", onClose);
        reject(error);
      },
    );
  });
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
