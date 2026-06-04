import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distBinDir = path.join(root, "dist", "bin");
const releaseDir = path.join(root, "release");
const buildDir = path.join(root, "build");
const macosResourceSourceDir = path.join(root, "installer", "macos", "resources");
const macosResourceBuildDir = path.join(buildDir, "macos-resources");
const windowsAssetDir = path.join(root, "installer", "windows", "assets");
const corsairLogoSource = path.join(windowsAssetDir, "CorsairLogo.bmp");
const corsairIconSource = path.join(windowsAssetDir, "corsair-cli.ico");
const macosIconPng = path.join(buildDir, "corsair-cli-icon.png");
const macosIconset = path.join(buildDir, "corsair-cli.iconset");
const macosIconIcns = path.join(buildDir, "corsair-cli.icns");
const macosSidebarLogoLeftPadding = 12;
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
  const productPkg = path.join(releaseDir, `icuewidget-${version}-macos.pkg`);
  const staleProductDmg = path.join(releaseDir, `icuewidget-${version}-macos.dmg`);
  await stageMacInstallerResources();

  run("pkgbuild", [
    "--root", stagedRoot,
    "--identifier", "com.corsair.icuewidget-cli",
    "--version", version,
    "--install-location", "/",
    "--scripts", path.join(root, "installer", "macos", "scripts"),
    componentPkg,
  ], root);

  await fs.writeFile(distribution, distributionXml(version), "utf8");
  run("productbuild", [
    "--distribution", distribution,
    "--resources", macosResourceBuildDir,
    "--package-path", path.join(root, "build"),
    productPkg,
  ], root);
  await applyFinderIcon(productPkg, macosIconIcns);
  await fs.rm(staleProductDmg, { force: true });
}

async function stageMacInstallerResources() {
  await fs.rm(macosResourceBuildDir, { recursive: true, force: true });
  await fs.mkdir(macosResourceBuildDir, { recursive: true });
  await mustExist(corsairLogoSource, "The shared CORSAIR logo asset is required for macOS installer branding.");
  await mustExist(corsairIconSource, "The shared CORSAIR icon asset is required for macOS installer branding.");

  await writeCorsairLogoPngs(
    corsairLogoSource,
    path.join(macosResourceBuildDir, "corsair-logo-light.png"),
    path.join(macosResourceBuildDir, "corsair-logo-dark.png"),
  );
  await fs.copyFile(
    path.join(macosResourceSourceDir, "welcome.html"),
    path.join(macosResourceBuildDir, "welcome.html"),
  );
  await buildIcnsFromIco(corsairIconSource, macosIconPng, macosIconset, macosIconIcns);
  await fs.copyFile(macosIconIcns, path.join(macosResourceBuildDir, "corsair-cli.icns"));
}

async function writeCorsairLogoPngs(sourceBmp, lightOutputPng, darkOutputPng) {
  const bmp = await read24BitBmp(sourceBmp);
  await fs.writeFile(lightOutputPng, encodeCorsairLogoPng(bmp, [0, 0, 0]));
  await fs.writeFile(darkOutputPng, encodeCorsairLogoPng(bmp, [255, 255, 255]));
}

async function read24BitBmp(sourceBmp) {
  const data = await fs.readFile(sourceBmp);
  if (data.toString("ascii", 0, 2) !== "BM") throw new Error(`${sourceBmp} is not a BMP file`);

  const pixelOffset = data.readUInt32LE(10);
  const dibSize = data.readUInt32LE(14);
  const width = data.readInt32LE(18);
  const rawHeight = data.readInt32LE(22);
  const planes = data.readUInt16LE(26);
  const bitsPerPixel = data.readUInt16LE(28);
  const compression = data.readUInt32LE(30);
  if (dibSize < 40 || planes !== 1 || bitsPerPixel !== 24 || compression !== 0) {
    throw new Error(`${sourceBmp} must be an uncompressed 24-bit BMP`);
  }

  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceY = bottomUp ? height - 1 - y : y;
    const sourceRow = pixelOffset + sourceY * rowStride;
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * 3;
      const target = (y * width + x) * 4;
      pixels[target] = data[source + 2];
      pixels[target + 1] = data[source + 1];
      pixels[target + 2] = data[source];
      pixels[target + 3] = 255;
    }
  }

  return { width, height, pixels };
}

function encodeCorsairLogoPng({ width, height, pixels }, color) {
  const canvasWidth = width + macosSidebarLogoLeftPadding;
  const raw = Buffer.alloc((canvasWidth * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawRow = y * (canvasWidth * 4 + 1);
    raw[rawRow] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = rawRow + 1 + (x + macosSidebarLogoLeftPadding) * 4;
      const luminance = 0.2126 * pixels[source] + 0.7152 * pixels[source + 1] + 0.0722 * pixels[source + 2];
      const alpha = logoAlphaFromLuminance(luminance);
      raw[target] = color[0];
      raw[target + 1] = color[1];
      raw[target + 2] = color[2];
      raw[target + 3] = alpha;
    }
  }

  return encodePng(canvasWidth, height, raw);
}

function logoAlphaFromLuminance(luminance) {
  const ink = 1 - Math.max(0, Math.min(255, luminance)) / 255;
  if (ink < 0.015) return 0;
  return Math.max(0, Math.min(255, Math.round(255 * Math.pow(ink, 0.88))));
}

function encodePng(width, height, rawRgbaScanlines) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rawRgbaScanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function applyFinderIcon(filePath, iconIcns) {
  const resourceFile = path.join(root, "build", `${path.basename(filePath)}-icon.rsrc`);
  if (process.platform !== "darwin" || !(await exists(iconIcns))) return;
  if (!["sips", "iconutil", "DeRez", "Rez", "SetFile"].every(commandExists)) {
    console.warn(`Skipping custom Finder icon for ${path.basename(filePath)} because Xcode resource tools are not available.`);
    return;
  }

  runQuiet("sips", ["-i", iconIcns], root);
  const result = spawnSync("DeRez", ["-only", "icns", iconIcns], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`DeRez -only icns ${iconIcns} failed`);
  await fs.writeFile(resourceFile, result.stdout, "utf8");
  run("Rez", ["-append", resourceFile, "-o", filePath], root);
  run("SetFile", ["-a", "C", filePath], root);
}

async function buildIcnsFromIco(sourceIco, sourcePng, iconset, outputIcns) {
  runQuiet("sips", ["-s", "format", "png", sourceIco, "--out", sourcePng], root);
  await buildIcns(sourcePng, iconset, outputIcns);
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

function distributionXml(version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>iCUE Widget CLI</title>
  <welcome file="welcome.html" mime-type="text/html"/>
  <icon file="corsair-cli.icns"/>
  <options customize="never" require-scripts="true"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <background file="corsair-logo-light.png" mime-type="image/png" scaling="none" alignment="topleft"/>
  <background-darkAqua file="corsair-logo-dark.png" mime-type="image/png" scaling="none" alignment="topleft"/>
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
