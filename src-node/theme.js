const enabled = process.env.NO_COLOR === undefined && process.stdout.isTTY;

const code = (open, close) => (value) => enabled ? `\u001b[${open}m${value}\u001b[${close}m` : String(value);

export const color = {
  bold: code(1, 22),
  dim: code(2, 22),
  cyan: code(36, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  red: code(31, 39),
  magenta: code(35, 39),
};

export function header(appName, version) {
  console.log(`${color.bold(appName)} ${color.cyan(version)}`);
  console.log(color.dim("iCUE widget packaging and scaffolding CLI"));
}

export function panel(title, rows, borderColor = color.cyan) {
  const rowText = rows.map((row) => Array.isArray(row) ? row.join("  ") : String(row));
  const maxWidth = Math.max(40, Math.min(76, (process.stdout.columns ?? 80) - 4));
  const normalized = rowText.flatMap((row) => wrapLine(row, maxWidth));
  const contentWidth = Math.min(maxWidth, Math.max(
    title.length + 2,
    ...normalized.map((row) => visibleLength(row)),
  ));
  const top = `╭─ ${title} ${"─".repeat(Math.max(0, contentWidth - title.length - 1))}╮`;
  const bottom = `╰${"─".repeat(contentWidth + 2)}╯`;
  console.log(borderColor(top));
  for (const content of normalized) {
    console.log(`${borderColor("│")} ${content}${" ".repeat(Math.max(0, contentWidth - visibleLength(content)))} ${borderColor("│")}`);
  }
  console.log(borderColor(bottom));
}

export function table(title, rows) {
  const keyWidth = Math.max(...rows.map(([key]) => key.length));
  panel(title, rows.map(([key, value]) => [color.dim(key.padEnd(keyWidth)), value]), color.cyan);
}

export function success(message) {
  panel("Success", [color.green(`✓ ${message}`)], color.green);
}

export function info(message) {
  panel("Info", [color.cyan(message)], color.cyan);
}

function visibleLength(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, "").length;
}

function wrapLine(value, width) {
  if (visibleLength(value) <= width) return [value];
  const words = String(value).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (visibleLength(next) <= width) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = `  ${word}`;
    }
  }
  if (current) lines.push(current);
  return lines;
}
