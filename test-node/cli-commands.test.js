import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const bin = path.resolve("node-bin/icuewidget.js");

async function makeWidget(dir) {
  await fs.mkdir(path.join(dir, "resources"), { recursive: true });
  await fs.mkdir(path.join(dir, "styles"));
  await fs.mkdir(path.join(dir, "scripts"));
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({
    author: "Test",
    id: "com.test.widget",
    name: "TestWidget",
    description: "A test widget",
    version: "1.0.0",
    preview_icon: "resources/icon.svg",
    min_framework_version: "1.0.0",
    os: [{ platform: "windows" }],
    supported_devices: [{ type: "dashboard_lcd" }],
  }), "utf8");
  await fs.writeFile(path.join(dir, "translation.json"), "{}", "utf8");
  await fs.writeFile(path.join(dir, "resources", "icon.svg"), "<svg/>", "utf8");
  await fs.writeFile(path.join(dir, "styles", "main.css"), "body { color: red; }", "utf8");
  await fs.writeFile(path.join(dir, "scripts", "main.js"), "window.icueEvents = {};", "utf8");
  await fs.writeFile(path.join(dir, "index.html"), '<html><head><title>T</title><link rel="icon" href="resources/icon.svg" /><link rel="stylesheet" href="styles/main.css" /></head><body><script src="scripts/main.js"></script></body></html>', "utf8");
}

test("help output includes commands", () => {
  const result = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8", env: noUpdateEnv() });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Commands/);
  assert.match(result.stdout, /update/);
});

test("update command migrates and packages widget", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-"));
  const widgetDir = path.join(root, "widget");
  await makeWidget(widgetDir);

  const result = spawnSync(process.execPath, [bin, "update", widgetDir, "--min-app-version", "5.45"], { encoding: "utf8", env: noUpdateEnv() });
  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(await fs.readFile(path.join(widgetDir, "manifest.json"), "utf8"));
  assert.equal(manifest.min_app_version, "5.45");
  assert.equal(manifest.version, "1.0.1");
  assert.equal(await exists(path.join(root, "testwidget.icuewidget")), true);
});

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function noUpdateEnv() {
  return { ...process.env, ICUEWIDGET_NO_UPDATE_CHECK: "1" };
}
