import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { APP_NAME, CLI_VERSION, NPM_PACKAGE_NAME } from "./constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME).replace("%40", "@")}/latest`;

export async function notifyAboutUpdate({
  argv = process.argv,
  env = process.env,
  now = Date.now(),
  stderr = process.stderr,
} = {}) {
  if (env.ICUEWIDGET_NO_UPDATE_CHECK === "1" || env.ICUEWIDGET_UPDATE_CHECK_WORKER === "1" || argv.includes("--update-check-worker")) return;

  let cache;
  try {
    cache = await readCache(env);
  } catch {
    cache = undefined;
  }

  if (cache?.latestVersion && isNewerVersion(cache.latestVersion, CLI_VERSION)) {
    printUpdateNotice(stderr, cache.latestVersion);
  }

  const checkedAt = Number(cache?.checkedAt ?? 0);
  if (!Number.isFinite(checkedAt) || now - checkedAt >= DAY_MS) {
    runUpdateCheckWorker({ env }).catch(() => {});
  }
}

export async function runUpdateCheckWorker({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (typeof fetchImpl !== "function") return;
  try {
    const latestVersion = await fetchLatestVersion(fetchImpl);
    if (!latestVersion) return;
    await writeCache(env, { latestVersion, checkedAt: now });
  } catch {
    // Update checks are best-effort and must never make CLI commands noisy/fail.
  }
}

export function isNewerVersion(candidate, current) {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function fetchLatestVersion(fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      headers: { "Accept": "application/json", "User-Agent": `${APP_NAME}/${CLI_VERSION}` },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const body = await response.json();
    return typeof body.version === "string" ? body.version : undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCache(env) {
  return JSON.parse(await fs.readFile(cachePath(env), "utf8"));
}

async function writeCache(env, data) {
  const filePath = cachePath(env);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function cachePath(env) {
  const base = env.ICUEWIDGET_UPDATE_CACHE_DIR || env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "icuewidget-cli", "update-check.json");
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  return match ? match.slice(1, 4).map(Number) : undefined;
}

function printUpdateNotice(stderr, latestVersion) {
  stderr.write(`Update available: ${APP_NAME} ${CLI_VERSION} → ${latestVersion}\n`);
  stderr.write("npm:\n");
  stderr.write(`  npm install -g ${NPM_PACKAGE_NAME}@latest\n`);
}
