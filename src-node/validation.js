import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import {
  ALLOWED_DEVICE_TYPES,
  ALLOWED_PLATFORMS,
  ALLOWED_PROPERTY_TYPES,
  APP_VERSION_RE,
  IDENTIFIER_RE,
  SEMVER_RE,
} from "./constants.js";
import { ensureInside, pathExists, readJson } from "./fs-utils.js";
import { ValidationError } from "./errors.js";
import { auditPermissionUsage, validatePermissions } from "./permissions.js";
import { findHeadXmlError } from "./xml-head.js";
import { checkHeadRules } from "./head-rules.js";

export { ValidationError };

export async function validateWidget(widgetDir) {
  const root = path.resolve(widgetDir);
  const warnings = [];

  for (const file of ["manifest.json", "index.html"]) {
    if (!(await pathExists(path.join(root, file)))) {
      throw new ValidationError(`Required file missing: ${file}`);
    }
  }

  const manifest = await validateManifest(root, warnings);
  if (await pathExists(path.join(root, "translation.json"))) {
    await readJson(path.join(root, "translation.json"));
  } else {
    warnings.push("translation.json is missing; localized labels will not be available.");
  }

  const sources = await validateIndex(root, warnings, manifest);
  sources.push(...(await readModuleSources(root, manifest)));
  auditPermissionUsage(sources, manifest, warnings);
  return { widgetDir: root, manifest, warnings };
}

async function validateManifest(root, warnings) {
  const manifest = await readJson(path.join(root, "manifest.json"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new ValidationError("manifest.json must contain a JSON object");
  }

  for (const key of [
    "author",
    "id",
    "name",
    "description",
    "version",
    "preview_icon",
    "min_app_version",
    "min_framework_version",
  ]) {
    requireString(manifest, key, `manifest.${key}`);
  }

  if (!IDENTIFIER_RE.test(manifest.id)) throw new ValidationError("manifest.id may only contain letters, numbers, dots, and hyphens");
  if (!SEMVER_RE.test(manifest.version)) throw new ValidationError("manifest.version must use semantic version format (for example 1.0.0)");
  if (!APP_VERSION_RE.test(manifest.min_app_version)) throw new ValidationError("manifest.min_app_version must use iCUE version format (for example 5.45)");
  if (!SEMVER_RE.test(manifest.min_framework_version)) throw new ValidationError("manifest.min_framework_version must use semantic version format (for example 1.0.0)");

  await validateRelativeFile(root, manifest.preview_icon, "manifest.preview_icon");

  if (!Array.isArray(manifest.os) || manifest.os.length === 0) throw new ValidationError("manifest.os must be a non-empty array");
  for (const [index, os] of manifest.os.entries()) {
    if (!os || typeof os !== "object") throw new ValidationError(`manifest.os[${index}] must be an object`);
    if (!ALLOWED_PLATFORMS.has(os.platform)) throw new ValidationError(`manifest.os[${index}].platform must be one of: ${[...ALLOWED_PLATFORMS].join(", ")}`);
  }

  if (!Array.isArray(manifest.supported_devices) || manifest.supported_devices.length === 0) {
    throw new ValidationError("manifest.supported_devices must be a non-empty array");
  }
  for (const [index, device] of manifest.supported_devices.entries()) {
    if (!device || typeof device !== "object") throw new ValidationError(`manifest.supported_devices[${index}] must be an object`);
    if (!ALLOWED_DEVICE_TYPES.has(device.type)) throw new ValidationError(`manifest.supported_devices[${index}].type must be one of: ${[...ALLOWED_DEVICE_TYPES].join(", ")}`);
    if (device.features !== undefined) validateStringArray(device.features, `manifest.supported_devices[${index}].features`);
  }

  if (manifest.interactive !== undefined && typeof manifest.interactive !== "boolean") {
    throw new ValidationError("manifest.interactive must be a boolean when provided");
  }
  if (manifest.interactive === true) {
    const nonDashboardTypes = manifest.supported_devices
      .map((d) => d.type)
      .filter((t) => t !== "dashboard_lcd");
    if (nonDashboardTypes.length > 0) {
      warnings.push(
        `manifest.interactive is true, but supported_devices includes ${nonDashboardTypes.join(", ")}. ` +
          `iCUE only recognizes interactive widgets on dashboard_lcd (Xeneon Edge). ` +
          `The widget will not appear for ${nonDashboardTypes.join(" or ")} devices.`
      );
    }
  }
  if (manifest.required_plugins !== undefined) validateStringArray(manifest.required_plugins, "manifest.required_plugins");
  validatePermissions(manifest, warnings);
  if (manifest.modules !== undefined) {
    validateStringArray(manifest.modules, "manifest.modules");
    for (const modulePath of manifest.modules) await validateRelativeFile(root, modulePath, "manifest.modules");
  }

  return manifest;
}

async function validateIndex(root, warnings, manifest = {}) {
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  if (!/rel=["'][^"']*icon/i.test(html)) warnings.push("index.html does not reference a favicon/icon.");

  validateHeadWellFormed(html);
  validateHeadXml(html);
  const headRules = checkHeadRules(html, manifest.name);
  warnings.push(...headRules.warnings);
  if (headRules.errors.length) {
    throw new ValidationError(
      `index.html <head> will be rejected by iCUE ("Missing Title Element"):\n  - ${headRules.errors.join("\n  - ")}`
    );
  }
  validatePropertyTypes(html);
  validatePropertyGroups(html);

  const sources = [{ label: "index.html", code: html }];
  let referencesIcueEvents = html.includes("icueEvents");
  const assetRefs = [...extractAttributes(html, "href"), ...extractAttributes(html, "src")];
  for (const ref of assetRefs) {
    if (isRemote(ref) || ref.startsWith("data:") || ref.startsWith("#")) continue;
    await validateRelativeFile(root, stripQuery(ref), `index.html asset reference ${ref}`);
    if (ref.endsWith(".css")) await validateCss(path.join(root, stripQuery(ref)));
    if (ref.endsWith(".js")) {
      const code = await validateJs(path.join(root, stripQuery(ref)));
      if (code.includes("icueEvents")) referencesIcueEvents = true;
      sources.push({ label: stripQuery(ref), code });
    }
  }
  if (!referencesIcueEvents) warnings.push("index.html or scripts do not reference icueEvents.");
  return sources;
}

// manifest.modules may be ES modules (import/export), so they are read for the permission
// audit but not syntax-checked with vm.Script.
async function readModuleSources(root, manifest) {
  const sources = [];
  for (const modulePath of manifest.modules ?? []) {
    sources.push({ label: modulePath, code: await fs.readFile(path.resolve(root, modulePath), "utf8") });
  }
  return sources;
}

// iCUE imports a widget by parsing <head> with a strict XML parser (Qt QDomDocument).
// HTML5 void elements written without a self-closing slash (e.g. `<meta charset="utf-8">`)
// are well-formed HTML but invalid XML: the parser never closes the tag, fails at </head>,
// and reports "Missing Title Element" because <title> is never reached. Catch it here so
// the widget fails validation instead of silently producing a package iCUE cannot import.
const VOID_ELEMENTS = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

function validateHeadWellFormed(html) {
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  if (!headMatch) {
    throw new ValidationError('index.html has no <head>...</head>. iCUE reads the widget name from <title> in <head> and rejects the widget with "Missing Title Element".');
  }
  if (!/<title>[^<]*\S[^<]*<\/title>/.test(headMatch[1])) {
    throw new ValidationError('index.html <head> has no non-empty <title>. iCUE requires it for the widget name and rejects the widget with "Missing Title Element".');
  }
  const head = headMatch[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const re = new RegExp(`<(${VOID_ELEMENTS.join("|")})\\b[^>]*?>`, "gi");
  let match;
  while ((match = re.exec(head))) {
    if (!match[0].endsWith("/>")) {
      throw new ValidationError(
        `index.html <head> has a non-self-closed <${match[1].toLowerCase()}> element: ${match[0].trim()}. ` +
          `iCUE parses the head as XML on import, so void elements must self-close (for example <${match[1].toLowerCase()} ... />). ` +
          `Otherwise iCUE rejects the widget with "Missing Title Element".`
      );
    }
  }
}

// The void-element check above gives a targeted message for the most common mistake; this
// runs the full strict-XML check over everything iCUE parses (doctype through </head>),
// including inline <script>/<style> content, entities, and attribute syntax.
function validateHeadXml(html) {
  const error = findHeadXmlError(html);
  if (!error) return;
  throw new ValidationError(
    `index.html is not well-formed XML at line ${error.line}, column ${error.column}: ${error.message}. ` +
      (error.hint ? `${error.hint} ` : "") +
      `iCUE parses everything up to </head> as strict XML on import and otherwise rejects the widget with "Missing Title Element".`
  );
}

// Each x-icue-property meta declares a control via data-type. iCUE rejects the widget
// with "Invalid meta parameter data type" if the value is not a known control type, so
// catch unknown types (e.g. "text" instead of "textfield", "boolean" instead of "switch")
// at validation time instead of on import.
function validatePropertyTypes(html) {
  const metaRe = /<meta\b[^>]*\bname=["']x-icue-property["'][^>]*>/gi;
  let meta;
  while ((meta = metaRe.exec(html))) {
    const tag = meta[0];
    const typeMatch = /\bdata-type=["']([^"']*)["']/i.exec(tag);
    if (!typeMatch) {
      throw new ValidationError(`x-icue-property is missing a data-type attribute: ${tag.trim()}`);
    }
    const type = typeMatch[1].trim();
    if (!ALLOWED_PROPERTY_TYPES.has(type)) {
      throw new ValidationError(
        `x-icue-property has an invalid data-type "${type}". ` +
          `iCUE accepts: ${[...ALLOWED_PROPERTY_TYPES].join(", ")}. ` +
          `(For example use "textfield" for text input and "switch" for a boolean toggle.)`
      );
    }
  }
}

// The x-icue-groups script organizes property controls into settings panels. iCUE
// JSON-parses it, so malformed JSON or an empty group silently drops the panel. Catch
// it here. Group title/info are JS expressions (e.g. tr('...')) but are always JSON
// strings, so the block as a whole stays valid JSON.
function validatePropertyGroups(html) {
  const match = /<script\b[^>]*\bid=["']x-icue-groups["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) return;
  let groups;
  try {
    groups = JSON.parse(match[1]);
  } catch (error) {
    throw new ValidationError(`x-icue-groups is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(groups)) throw new ValidationError("x-icue-groups must be a JSON array of groups.");
  groups.forEach((group, index) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      throw new ValidationError(`x-icue-groups[${index}] must be an object.`);
    }
    if (!Array.isArray(group.properties) || group.properties.length === 0) {
      throw new ValidationError(`x-icue-groups[${index}] must list at least one property.`);
    }
  });
}

function* extractAttributes(html, attribute) {
  const re = new RegExp(`${attribute}=["']([^"']+)["']`, "gi");
  let match;
  while ((match = re.exec(html))) yield match[1];
}

function stripQuery(value) {
  return value.split(/[?#]/, 1)[0];
}

function isRemote(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

async function validateCss(filePath) {
  const css = await fs.readFile(filePath, "utf8");
  const stack = [];
  const pairs = { "(": ")", "[": "]", "{": "}" };
  for (const char of css) {
    if (pairs[char]) stack.push(pairs[char]);
    else if ([")", "]", "}"].includes(char) && stack.pop() !== char) {
      throw new ValidationError(`${path.basename(filePath)} has unbalanced CSS delimiters`);
    }
  }
  if (stack.length) throw new ValidationError(`${path.basename(filePath)} has unbalanced CSS delimiters`);
}

async function validateJs(filePath) {
  const code = await fs.readFile(filePath, "utf8");
  try {
    new vm.Script(code, { filename: filePath });
  } catch (error) {
    throw new ValidationError(`${path.basename(filePath)} has invalid JavaScript: ${error.message}`);
  }
  return code;
}

async function validateRelativeFile(root, relativePath, label) {
  const resolved = path.resolve(root, relativePath);
  if (!ensureInside(root, resolved)) throw new ValidationError(`${label} must stay inside the widget directory`);
  if (!(await pathExists(resolved))) throw new ValidationError(`${label} does not exist: ${relativePath}`);
}

function requireString(object, key, label) {
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
}

function validateStringArray(value, label) {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array`);
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") throw new ValidationError(`${label}[${index}] must be a non-empty string`);
  }
}
