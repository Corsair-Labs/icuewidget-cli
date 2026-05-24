import path from "node:path";
import { APP_VERSION_RE, DEFAULT_APP_VERSION, SEMVER_RE } from "./constants.js";
import { readJson, writeJson } from "./fs-utils.js";
import { promptValidated } from "./prompts.js";

export function bumpPatchVersion(value) {
  const [major, minor, patch] = value.split(".");
  return `${major}.${minor}.${Number(patch) + 1}`;
}

export async function updateManifestToLatest(widgetDir, options = {}) {
  const manifestPath = path.join(widgetDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  const changes = [];
  const requirementChanges = [];

  if (typeof manifest.min_app_version !== "string" || !APP_VERSION_RE.test(manifest.min_app_version.trim())) {
    let value = options.minAppVersion;
    if (value !== undefined) {
      value = value.trim();
      if (!APP_VERSION_RE.test(value)) throw new Error("--min-app-version must use iCUE version format like 5.45 or 5.45.104.");
    } else {
      value = await promptValidated(
        "Minimum iCUE version required",
        DEFAULT_APP_VERSION,
        (answer) => APP_VERSION_RE.test(answer),
        "Use iCUE version format like 5.45 or 5.45.104.",
      );
    }
    manifest.min_app_version = value;
    requirementChanges.push("manifest.min_app_version");
  }

  if (options.version !== undefined) {
    const version = options.version.trim();
    if (!SEMVER_RE.test(version)) throw new Error("--version must use semantic version format like 1.0.1.");
    if (manifest.version !== version) {
      manifest.version = version;
      changes.push("manifest.version");
    }
  } else if (requirementChanges.length) {
    if (typeof manifest.version !== "string" || !SEMVER_RE.test(manifest.version.trim())) {
      throw new Error("manifest.version must use semantic version format like 1.0.0, or pass --version to set it.");
    }
    manifest.version = bumpPatchVersion(manifest.version.trim());
    changes.push("manifest.version");
  }

  changes.push(...requirementChanges);
  if (changes.length) await writeJson(manifestPath, manifest);
  return changes;
}
