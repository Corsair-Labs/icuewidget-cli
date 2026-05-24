import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distBinDir = path.join(root, "dist", "bin");
const releaseDir = path.join(root, "release");
const version = (await fs.readFile(path.join(distBinDir, "version.txt"), "utf8")).trim();

await fs.mkdir(releaseDir, { recursive: true });

if (process.platform === "win32") {
  await buildWindowsInstaller(version);
} else if (process.platform === "darwin") {
  await buildMacInstaller(version);
} else {
  console.log("No native installer builder is configured for this platform.");
}

async function buildWindowsInstaller(version) {
  const exe = path.join(distBinDir, "icuewidget.exe");
  await mustExist(exe, "Run npm run build:binaries with a Windows target first.");
  const script = path.join(root, "installer", "windows", "icuewidget-installer.nsi");
  run("makensis", [
    `/DPRODUCT_VERSION=${version}`,
    `/DCLI_BINARY=${exe}`,
    `/DOUT_FILE=${path.join(releaseDir, `icuewidget-${version}-windows-installer.exe`)}`,
    script,
  ], root);
}

async function buildMacInstaller(version) {
  const arm = path.join(distBinDir, "icuewidget-macos-arm64");
  const x64 = path.join(distBinDir, "icuewidget-macos-x64");
  const single = path.join(distBinDir, "icuewidget");
  const stagedRoot = path.join(root, "build", "pkg-root");
  const installBin = path.join(stagedRoot, "usr", "local", "bin");
  await fs.rm(stagedRoot, { recursive: true, force: true });
  await fs.mkdir(installBin, { recursive: true });

  if (await exists(arm) && await exists(x64)) {
    run("lipo", ["-create", "-output", path.join(installBin, "icuewidget"), arm, x64], root);
  } else if (await exists(single)) {
    await fs.copyFile(single, path.join(installBin, "icuewidget"));
  } else if (await exists(arm)) {
    await fs.copyFile(arm, path.join(installBin, "icuewidget"));
  } else if (await exists(x64)) {
    await fs.copyFile(x64, path.join(installBin, "icuewidget"));
  } else {
    throw new Error("No macOS binary found. Run npm run build:binaries with a macOS target first.");
  }

  await fs.chmod(path.join(installBin, "icuewidget"), 0o755);
  const componentPkg = path.join(root, "build", `icuewidget-${version}-component.pkg`);
  const distribution = path.join(root, "build", "Distribution.xml");

  run("pkgbuild", [
    "--root", stagedRoot,
    "--identifier", "com.corsair.icuewidget-cli",
    "--version", version,
    "--install-location", "/",
    "--scripts", path.join(root, "installer", "macos", "scripts"),
    componentPkg,
  ], root);

  await fs.writeFile(distribution, distributionXml(version), "utf8");
  const productPkg = path.join(releaseDir, `icuewidget-${version}-macos.pkg`);
  run("productbuild", [
    "--distribution", distribution,
    "--resources", path.join(root, "installer", "macos", "resources"),
    "--package-path", path.join(root, "build"),
    productPkg,
  ], root);
  await applyPkgFinderIcon(productPkg);
}

async function mustExist(filePath, message) {
  if (!(await exists(filePath))) throw new Error(`${filePath} not found. ${message}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function runQuiet(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "ignore", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

async function applyPkgFinderIcon(pkgPath) {
  const iconPng = path.join(root, "installer", "macos", "resources", "icuewidget-icon.png");
  const iconset = path.join(root, "build", "icuewidget.iconset");
  const iconIcns = path.join(root, "installer", "macos", "resources", "icuewidget-icon.icns");
  const resourceFile = path.join(root, "build", "pkg-icon.r");
  if (process.platform !== "darwin" || !(await exists(iconPng))) return;
  if (!["sips", "iconutil", "DeRez", "Rez", "SetFile"].every(commandExists)) {
    console.warn("Skipping custom .pkg Finder icon because Xcode resource tools are not available.");
    return;
  }

  await buildIcns(iconPng, iconset, iconIcns);
  await fs.writeFile(
    resourceFile,
    `read 'icns' (-16455, "CustomIcon") "${escapeRezPath(path.relative(root, iconIcns))}";\n`,
    "utf8",
  );
  run("Rez", ["-append", resourceFile, "-o", pkgPath], root);
  run("SetFile", ["-a", "C", pkgPath], root);
}

function escapeRezPath(filePath) {
  return filePath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function buildIcns(sourcePng, iconset, outputIcns) {
  await fs.rm(iconset, { recursive: true, force: true });
  await fs.mkdir(iconset, { recursive: true });
  const specs = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, filename] of specs) {
    runQuiet("sips", ["-z", String(size), String(size), sourcePng, "--out", path.join(iconset, filename)], root);
  }
  run("iconutil", ["-c", "icns", iconset, "-o", outputIcns], root);
}

function commandExists(command) {
  const result = spawnSync("/bin/sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

function distributionXml(version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>iCUE Widget CLI</title>
  <welcome file="welcome.html"/>
  <readme file="readme.html"/>
  <options customize="never" require-scripts="true"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <pkg-ref id="com.corsair.icuewidget-cli" version="${escapeXml(version)}">icuewidget-${escapeXml(version)}-component.pkg</pkg-ref>
  <choices-outline>
    <line choice="default"/>
  </choices-outline>
  <choice id="default" title="iCUE Widget CLI">
    <pkg-ref id="com.corsair.icuewidget-cli"/>
  </choice>
</installer-gui-script>
`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
