import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_NAME,
  APP_VERSION_RE,
  CLI_VERSION,
  DEFAULT_APP_VERSION,
  IDENTIFIER_RE,
  SEMVER_RE,
  SLUG_RE,
} from "./constants.js";
import { pathExists } from "./fs-utils.js";
import { updateManifestToLatest } from "./manifest-update.js";
import { closePrompts, prompt, promptValidated } from "./prompts.js";
import { scaffoldWidget } from "./scaffold.js";
import { color, header, info, panel, success, table } from "./theme.js";
import { notifyAboutUpdate, runUpdateCheckWorker } from "./update-check.js";
import { ValidationError, validateWidget } from "./validation.js";
import { createPackage } from "./zip.js";

const COMMANDS = ["init", "validate", "update", "package"];

export async function main(argv = process.argv) {
  try {
    const args = argv.slice(2);
    if (has(args, "--update-check-worker")) {
      await runUpdateCheckWorker();
      return;
    }
    if (args.length === 0) {
      printHelp();
      return;
    }
    if (has(args, "--help") || has(args, "-h")) {
      if (COMMANDS.includes(args[0])) printCommandHelp(args[0]);
      else printHelp();
      return;
    }
    // `update <widget> --version <semver>` uses --version as a subcommand option, so only
    // treat it as the global flag when no subcommand leads the argument list.
    if (!COMMANDS.includes(args[0]) && (has(args, "--version") || has(args, "-v"))) {
      console.log(CLI_VERSION);
      return;
    }

    const [command, ...rest] = args;
    switch (command) {
      case "init":
        await initCommand(rest);
        break;
      case "validate":
        await validateCommand(rest);
        break;
      case "update":
        await updateCommand(rest);
        break;
      case "package":
        await packageCommand(rest);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    closePrompts();
    await notifyAboutUpdate({ argv });
  }
}

async function initCommand(args) {
  const { positionals } = parseArgs(args);
  const requested = positionals[0] ?? ".";
  const widgetNameDefault = requested === "." ? "HelloWidget" : path.basename(requested);
  const widgetName = await promptValidated("Widget name", widgetNameDefault, (v) => v.trim().length > 0, "Widget name is required.");
  const targetDir = path.resolve(requested === "." ? slugify(widgetName) : requested);
  if (await pathExists(targetDir)) {
    const entries = await fs.readdir(targetDir);
    if (entries.length) throw new Error(`Target directory is not empty: ${targetDir}`);
  }

  const answers = {
    widgetName,
    author: await prompt("Author", "Corsair"),
    widgetId: await promptValidated("Widget id", buildDefaultWidgetId(widgetName), validateIdentifier, "Use letters, numbers, dots, and hyphens only."),
    description: await prompt("Description", `${widgetName} iCUE widget`),
    version: await promptValidated("Version", "1.0.0", isSemver, "Use semantic version format like 1.0.0."),
    minAppVersion: await promptValidated("Minimum iCUE version required", DEFAULT_APP_VERSION, isAppVersion, "Use iCUE version format like 5.45 or 5.45.104."),
    previewIcon: await prompt("Preview icon path", "resources/icon.svg"),
  };

  await scaffoldWidget(targetDir, answers);
  header(APP_NAME, CLI_VERSION);
  success("Widget scaffold created");
  table("Summary", [
    ["Widget", answers.widgetName],
    ["Widget id", answers.widgetId],
    ["Minimum iCUE", answers.minAppVersion],
    ["Path", targetDir],
  ]);
  panel("Next steps", [
    `1. Edit ${path.join(targetDir, "index.html")}`,
    `2. Customize ${path.join(targetDir, "resources", "icon.svg")}`,
    `3. Run ${APP_NAME} validate ${path.basename(targetDir)}`,
    `4. Run ${APP_NAME} package ${path.basename(targetDir)}`,
  ], color.magenta);
}

async function validateCommand(args) {
  const { positionals } = parseArgs(args);
  const result = await runValidation(resolveWidgetDir(positionals[0] ?? "."));
  header(APP_NAME, CLI_VERSION);
  success("Widget is valid");
  table("Summary", [["Widget", result.manifest.name], ["Version", result.manifest.version]]);
  printWarnings(result.warnings);
}

async function packageCommand(args) {
  const { positionals, options } = parseArgs(args, { output: ["--output", "-o"] });
  const widgetDir = resolveWidgetDir(positionals[0] ?? ".");
  const result = await runValidation(widgetDir);
  let outputPath = options.output ? path.resolve(options.output) : defaultOutputPath(widgetDir, result.manifest);
  if (path.extname(outputPath) !== ".icuewidget") outputPath = `${outputPath}.icuewidget`;
  await createPackage(widgetDir, outputPath);
  header(APP_NAME, CLI_VERSION);
  success("Package created");
  table("Summary", [["Widget", result.manifest.name], ["Output", outputPath]]);
  printWarnings(result.warnings);
}

async function updateCommand(args) {
  const { positionals, options } = parseArgs(args, {
    minAppVersion: ["--min-app-version"],
    version: ["--version"],
    output: ["--output", "-o"],
  });
  const widgetDir = resolveWidgetDir(positionals[0] ?? ".");
  const changes = await updateManifestToLatest(widgetDir, options);
  const result = await runValidation(widgetDir);
  if (!changes.length) {
    header(APP_NAME, CLI_VERSION);
    info("Widget is up to date.");
    printWarnings(result.warnings);
    return;
  }
  let outputPath = options.output ? path.resolve(options.output) : defaultOutputPath(widgetDir, result.manifest);
  if (path.extname(outputPath) !== ".icuewidget") outputPath = `${outputPath}.icuewidget`;
  await createPackage(widgetDir, outputPath);
  header(APP_NAME, CLI_VERSION);
  success("Widget updated and package regenerated");
  table("Summary", [["Widget", result.manifest.name], ["Updated", changes.join(", ")], ["Output", outputPath]]);
  printWarnings(result.warnings);
}

async function runValidation(widgetDir) {
  try {
    return await validateWidget(widgetDir);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw error;
  }
}

function printHelp() {
  header(APP_NAME, CLI_VERSION);
  console.log();
  console.log("Create, validate, update, and package iCUE widgets.");
  console.log();
  console.log(`${color.yellow("Usage:")} ${color.bold(APP_NAME)} [-v | --version] [-h | --help] <command> [<args>]`);
  console.log();
  panel("Options", [
    `${color.cyan("-v, --version")}  Show the CLI version and exit.`,
    `${color.cyan("-h, --help")}     Show this message and exit.`,
  ]);
  panel("Commands", [
    `${color.cyan("init")}      Creates a new widget from the starter template.`,
    `${color.cyan("validate")}  Validates widget files, manifest requirements, and permissions.`,
    `${color.cyan("update")}    Sets the minimum iCUE version and/or widget version, then regenerates the package.`,
    `${color.cyan("package")}   Validates widget and creates an .icuewidget package.`,
  ]);
  console.log(`Run ${color.bold(`${APP_NAME} <command> --help`)} for command-specific options.`);
  console.log();
  panel("Examples", [
    `${APP_NAME} init HelloWidget`,
    `${APP_NAME} validate HelloWidget`,
    `${APP_NAME} update HelloWidget --min-app-version 5.45`,
    `${APP_NAME} update HelloWidget --version 1.0.1`,
    `${APP_NAME} package HelloWidget`,
  ], color.magenta);
}

const COMMAND_HELP = {
  init: {
    usage: "init [<dir>]",
    summary: "Creates a new widget from the starter template, prompting for its details.",
    options: [],
    examples: ["init HelloWidget"],
  },
  validate: {
    usage: "validate [<widget-dir>]",
    summary: "Validates widget files, manifest requirements, and manifest permissions (schema errors fail; code-vs-manifest mismatches are warnings).",
    options: [],
    examples: ["validate HelloWidget"],
  },
  update: {
    usage: "update [<widget-dir>] [--min-app-version <ver>] [--version <semver>] [-o <file>]",
    summary: "Updates the manifest and regenerates the package. Prompts for min_app_version if it is missing.",
    options: [
      ["--min-app-version <ver>", "Set manifest.min_app_version (e.g. 5.45 or 5.45.104). Bumps the patch version unless --version is given."],
      ["--version <semver>", "Set manifest.version (e.g. 1.0.1)."],
      ["-o, --output <file>", "Write the package to this path."],
    ],
    examples: ["update HelloWidget --min-app-version 5.45", "update HelloWidget --version 1.0.1"],
  },
  package: {
    usage: "package [<widget-dir>] [-o <file>]",
    summary: "Validates the widget and creates an .icuewidget package.",
    options: [["-o, --output <file>", "Write the package to this path."]],
    examples: ["package HelloWidget", "package HelloWidget -o dist/hello.icuewidget"],
  },
};

function printCommandHelp(command) {
  const { usage, summary, options, examples } = COMMAND_HELP[command];
  header(APP_NAME, CLI_VERSION);
  console.log();
  console.log(summary);
  console.log();
  console.log(`${color.yellow("Usage:")} ${color.bold(APP_NAME)} ${usage}`);
  console.log();
  if (options.length) panel("Options", options.map(([flag, text]) => `${color.cyan(flag)}  ${text}`));
  panel("Examples", examples.map((example) => `${APP_NAME} ${example}`), color.magenta);
}

function parseArgs(args, specs = {}) {
  const options = {};
  const positionals = [];
  const aliases = new Map();
  for (const [name, flags] of Object.entries(specs)) for (const flag of flags) aliases.set(flag, name);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (aliases.has(arg)) {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value`);
      options[aliases.get(arg)] = value;
      i += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  return { options, positionals };
}

function has(args, flag) {
  return args.includes(flag);
}

export function slugify(value) {
  return value.toLowerCase().replace(SLUG_RE, "-").replace(/^-+|-+$/g, "") || "widget";
}

export function buildDefaultWidgetId(widgetName) {
  return `com.corsair.${slugify(widgetName)}`;
}

export function defaultOutputPath(widgetDir, manifest) {
  return path.join(path.dirname(path.resolve(widgetDir)), `${slugify(manifest.name || manifest.id || path.basename(widgetDir))}.icuewidget`);
}

export function resolveWidgetDir(value) {
  return path.resolve(value);
}

export function isSemver(value) {
  return SEMVER_RE.test(value);
}

export function isAppVersion(value) {
  return APP_VERSION_RE.test(value);
}

export function validateIdentifier(value) {
  return IDENTIFIER_RE.test(value);
}

function printWarnings(warnings) {
  if (!warnings.length) return;
  panel("Warnings", warnings.map((warning) => color.yellow(`! ${warning}`)), color.yellow);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
