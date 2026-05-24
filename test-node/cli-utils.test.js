import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDefaultWidgetId, defaultOutputPath, isAppVersion, isSemver, slugify } from "../src-node/cli.js";
import { updateManifestToLatest } from "../src-node/manifest-update.js";

test("slugify and default widget id", () => {
  assert.equal(slugify("Hello Widget!"), "hello-widget");
  assert.equal(buildDefaultWidgetId("Hello Widget!"), "com.corsair.hello-widget");
});

test("version validators", () => {
  assert.equal(isSemver("1.2.3"), true);
  assert.equal(isSemver("1.2"), false);
  assert.equal(isAppVersion("5.45"), true);
  assert.equal(isAppVersion("5.45.104"), true);
  assert.equal(isAppVersion("5"), false);
});

test("default output path uses manifest name", () => {
  const widgetDir = path.join(os.tmpdir(), "Widget Dir");
  assert.equal(defaultOutputPath(widgetDir, { name: "My Widget" }), path.join(os.tmpdir(), "my-widget.icuewidget"));
});

test("updateManifestToLatest adds min_app_version and bumps version", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-"));
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ name: "A", version: "1.0.0" }), "utf8");

  const changes = await updateManifestToLatest(dir, { minAppVersion: "5.45" });
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));

  assert.deepEqual(changes, ["manifest.version", "manifest.min_app_version"]);
  assert.equal(manifest.version, "1.0.1");
  assert.equal(manifest.min_app_version, "5.45");
});

test("updateManifestToLatest respects explicit version", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-"));
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ name: "A", version: "1.0.0" }), "utf8");

  await updateManifestToLatest(dir, { minAppVersion: "5.45", version: "2.0.0" });
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));

  assert.equal(manifest.version, "2.0.0");
});
