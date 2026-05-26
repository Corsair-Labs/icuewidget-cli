import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const packageDir = path.join(buildDir, "cli-package");
const distBinDir = path.join(root, "dist", "bin");
const packageSpec = process.env.CLI_PACKAGE_SPEC ?? ".";

const targets = (process.env.PKG_TARGETS ?? defaultTargets()).split(",").map((target) => target.trim()).filter(Boolean);

await fs.rm(packageDir, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });
await fs.mkdir(distBinDir, { recursive: true });

run("npm", ["pack", packageSpec, "--pack-destination", packageDir], root);
const [tarball] = (await fs.readdir(packageDir)).filter((file) => file.endsWith(".tgz"));
if (!tarball) throw new Error(`npm pack did not create a tarball for ${packageSpec}`);

run("npm", ["install", path.join(packageDir, tarball), "--prefix", packageDir, "--ignore-scripts", "--no-audit", "--no-fund"], root);
const cliRoot = await findInstalledCliRoot(packageDir);
const cliPackageJson = JSON.parse(await fs.readFile(path.join(cliRoot, "package.json"), "utf8"));
const cliVersion = resolveBuildVersion(cliPackageJson.version);
const entry = path.join(cliRoot, "node-bin", "icuewidget.js");
await stampCliRuntimeVersion(cliRoot, cliVersion);

for (const target of targets) {
  const output = path.join(distBinDir, outputName(target));
  run("npx", ["--yes", "@yao-pkg/pkg", entry, "--targets", target, "--output", output], root);
}

await fs.writeFile(path.join(distBinDir, "version.txt"), `${cliVersion}\n`, "utf8");
console.log(`Built iCUE Widget CLI ${cliVersion} binaries in ${distBinDir}`);

function resolveBuildVersion(packageVersion) {
  if (process.env.CLI_BUILD_VERSION) return assertSemver(process.env.CLI_BUILD_VERSION, "CLI_BUILD_VERSION");
  const patch = process.env.CLI_BUILD_PATCH ?? process.env.BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER;
  if (!patch) return packageVersion;
  if (!/^\d+$/.test(patch)) throw new Error(`Build patch must be numeric: ${patch}`);
  const [major, minor] = packageVersion.split(".");
  return `${major}.${minor}.${patch}`;
}

function assertSemver(value, label) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`${label} must use semantic version format like 0.4.123`);
  return value;
}

async function stampCliRuntimeVersion(cliRoot, version) {
  const constantsPath = path.join(cliRoot, "src-node", "constants.js");
  const source = await fs.readFile(constantsPath, "utf8");
  await fs.writeFile(
    constantsPath,
    source.replace(/export const CLI_VERSION = "[^"]+";/, `export const CLI_VERSION = "${version}";`),
    "utf8",
  );
}

async function findInstalledCliRoot(packageDir) {
  const nodeModules = path.join(packageDir, "node_modules");
  const candidates = [
    path.join(nodeModules, "@corsair", "icuewidget-cli"),
    path.join(nodeModules, "icuewidget-cli"),
  ];
  for (const candidate of candidates) {
    if (await exists(path.join(candidate, "package.json"))) return candidate;
  }
  throw new Error(`Could not find installed CLI package in ${nodeModules}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultTargets() {
  switch (process.platform) {
    case "darwin":
      return process.arch === "arm64" ? "node20-macos-arm64" : "node20-macos-x64";
    case "win32":
      return "node20-win-x64";
    default:
      return "node20-linux-x64";
  }
}

function outputName(target) {
  if (target.includes("win")) return "icuewidget.exe";
  if (target.includes("macos-arm64")) return "icuewidget-macos-arm64";
  if (target.includes("macos-x64")) return "icuewidget-macos-x64";
  return `icuewidget-${target}`;
}

function run(command, args, cwd) {
  const result = spawnSync(executable(command), args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function executable(command) {
  return process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
}
