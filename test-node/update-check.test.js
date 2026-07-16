import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isNewerVersion, notifyAboutUpdate, runUpdateCheckWorker } from "../src-node/update-check.js";

test("semver comparison detects newer versions", () => {
  assert.equal(isNewerVersion("0.4.1", "0.4.0"), true);
  assert.equal(isNewerVersion("0.5.0", "0.4.9"), true);
  assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
  assert.equal(isNewerVersion("0.4.0", "0.4.0"), false);
  assert.equal(isNewerVersion("0.3.9", "0.4.0"), false);
  assert.equal(isNewerVersion("not-a-version", "0.4.0"), false);
});

test("notifyAboutUpdate prints cached update and triggers fresh check", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-update-"));
  const cacheDir = path.join(root, "cache");
  await fs.mkdir(path.join(cacheDir, "icuewidget-cli"), { recursive: true });
  await fs.writeFile(path.join(cacheDir, "icuewidget-cli", "update-check.json"), JSON.stringify({
    latestVersion: "0.4.3",
    checkedAt: 0,
  }), "utf8");

  let output = "";
  await notifyAboutUpdate({
    argv: [process.execPath, "/tmp/icuewidget.js", "validate"],
    env: { ...process.env, ICUEWIDGET_UPDATE_CACHE_DIR: cacheDir },
    now: 24 * 60 * 60 * 1000,
    stderr: { write(value) { output += value; } },
  });

  assert.match(output, /Update available: icuewidget 0\.4\.0 → 0\.4\.3/);
  assert.match(output, /npm install -g icuewidget-cli@latest/);
});

test("notifyAboutUpdate respects opt-out", async () => {
  let output = "";
  const spawns = [];
  await notifyAboutUpdate({
    env: { ...process.env, ICUEWIDGET_NO_UPDATE_CHECK: "1" },
    stderr: { write(value) { output += value; } },
    spawnImpl() {
      spawns.push(true);
      return { unref() {} };
    },
  });
  assert.equal(output, "");
  assert.equal(spawns.length, 0);
});

test("runUpdateCheckWorker fetches latest npm version into cache", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-update-"));
  await runUpdateCheckWorker({
    env: { ...process.env, ICUEWIDGET_UPDATE_CACHE_DIR: cacheDir },
    now: 1234,
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.4.5" }) }),
  });

  const cache = JSON.parse(await fs.readFile(path.join(cacheDir, "icuewidget-cli", "update-check.json"), "utf8"));
  assert.deepEqual(cache, { latestVersion: "0.4.5", checkedAt: 1234 });
});
