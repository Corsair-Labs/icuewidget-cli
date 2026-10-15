import {
  ALLOWED_PERMISSION_TYPES,
  FILE_SYSTEM_PLUGIN_PREFIX,
  KNOWN_PERMISSION_APPLICATIONS,
  PERMISSION_PATH_MACROS,
  PERMISSION_TYPE_FIELDS,
  STREAM_DECK_PLUGIN_PREFIX,
} from "./constants.js";
import { ValidationError } from "./errors.js";

const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;
const MACRO_PREFIX_RE = /^<([^<>\\/]*)>(?=$|[\\/])/;
const LOOPBACK_V4_RE = /^127\.\d+\.\d+\.\d+$/;
const IPV6_RE = /^\[?[0-9a-fA-F:]*:[0-9a-fA-F:]*\]?$/;

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

// Validates manifest.permissions against the documented schema. Structural problems that
// make an entry meaningless throw; things that are legal but risky or likely mistakes
// (broad scopes, plugin/permission mismatches, unknown applications) are warnings.
export function validatePermissions(manifest, warnings) {
  const permissions = manifest.permissions;
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) throw new ValidationError("manifest.permissions must be an array");
    const seen = new Set();
    permissions.forEach((entry, index) => {
      const label = `manifest.permissions[${index}]`;
      validatePermissionEntry(entry, label, warnings);
      const key = permissionKey(entry);
      if (seen.has(key)) warnings.push(`${label} duplicates an earlier ${entry.type} permission.`);
      seen.add(key);
    });
  }
  crossCheckPlugins(manifest, getPermissions(manifest), warnings);
}

export function getPermissions(manifest) {
  return Array.isArray(manifest.permissions) ? manifest.permissions : [];
}

function validatePermissionEntry(entry, label, warnings) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new ValidationError(`${label} must be an object`);
  }
  if (typeof entry.type !== "string" || !ALLOWED_PERMISSION_TYPES.has(entry.type)) {
    throw new ValidationError(
      `${label}.type must be one of: ${[...ALLOWED_PERMISSION_TYPES].join(", ")}` +
        (typeof entry.type === "string" ? ` (got "${entry.type}")` : ""),
    );
  }

  const allowedFields = new Set(["type", ...(PERMISSION_TYPE_FIELDS[entry.type] ?? [])]);
  for (const field of Object.keys(entry)) {
    if (!allowedFields.has(field)) {
      warnings.push(`${label} has field "${field}", which is not documented for the "${entry.type}" permission.`);
    }
  }

  switch (entry.type) {
    case "file":
    case "folder":
      validatePathPermission(entry, label, warnings);
      break;
    case "url":
      validateUrlPermission(entry, label, warnings);
      break;
    case "self_signed_certificate":
      requireNonEmptyString(entry.host, `${label}.host`);
      if (/[\s/\\?#@]|:\/\//.test(entry.host)) {
        throw new ValidationError(`${label}.host must be a bare hostname (no protocol, path, or port)`);
      }
      break;
    case "application":
      requireNonEmptyString(entry.application, `${label}.application`);
      if (!KNOWN_PERMISSION_APPLICATIONS.has(entry.application.trim().toLowerCase())) {
        warnings.push(
          `${label}.application "${entry.application}" is not a documented application. ` +
            `Documented applications: Stream Deck. Plugins only check permissions for applications they support.`,
        );
      }
      break;
    default:
      break;
  }
}

function validatePathPermission(entry, label, warnings) {
  const field = `${label}.path`;
  requireNonEmptyString(entry.path, field);
  const value = entry.path.trim();

  if (/\{[A-Za-z]+\}/.test(value)) {
    throw new ValidationError(
      `${field} uses {Macro} curly braces ("${value}"). Manifest permission paths use <Macro> angle brackets (for example <Documents>/my-widget); curly braces are only for File System Provider watchPath() calls.`,
    );
  }

  if (value.startsWith("<")) {
    const match = MACRO_PREFIX_RE.exec(value);
    if (!match) {
      throw new ValidationError(`${field} has a malformed <Macro> prefix: "${value}". Use <MacroName> followed by a path separator, for example <Documents>/my-widget.`);
    }
    const macro = match[1];
    if (!PERMISSION_PATH_MACROS.has(macro)) {
      const caseMatch = [...PERMISSION_PATH_MACROS].find((name) => name.toLowerCase() === macro.toLowerCase());
      if (!caseMatch) {
        throw new ValidationError(`${field} uses unknown macro <${macro}>. Supported macros: ${[...PERMISSION_PATH_MACROS].map((name) => `<${name}>`).join(", ")}.`);
      }
      warnings.push(`${field} uses <${macro}>; the documented spelling is <${caseMatch}>.`);
    }
    if (/<[^<>\\/]*>/.test(value.slice(match[0].length))) {
      warnings.push(`${field} contains another <Macro> after the prefix; macros are documented only as a path prefix.`);
    }
  } else if (!ABSOLUTE_PATH_RE.test(value)) {
    throw new ValidationError(`${field} must be an absolute path or start with a <Macro> prefix such as <Documents> (got "${value}")`);
  } else if (/<[^<>\\/]*>/.test(value)) {
    warnings.push(`${field} contains a <Macro> that is not at the start of the path; macros are documented only as a path prefix.`);
  }

  if (value.split(/[\\/]/).includes("..")) {
    warnings.push(`${field} contains ".." segments; declare the real target path so the approval dialog shows what is actually granted.`);
  }
  if (entry.type === "file" && /[\\/]$/.test(value)) {
    warnings.push(`${field} ends with a path separator but the permission type is "file". Use "folder" to grant a directory.`);
  }
}

function validateUrlPermission(entry, label, warnings) {
  const field = `${label}.domain`;
  requireNonEmptyString(entry.domain, field);
  const domain = entry.domain.trim();

  if (domain.toLowerCase() !== "any") {
    if (/:\/\//.test(domain) || /[/\\?#@\s]/.test(domain)) {
      throw new ValidationError(`${field} must be a hostname or IP address without protocol or path (got "${domain}")`);
    }
    if (!IPV6_RE.test(domain) && /:/.test(domain)) {
      throw new ValidationError(`${field} must not include a port (got "${domain}"). Put the port in the "port" field instead.`);
    }
  } else {
    warnings.push(`${label} grants network access to every external host (domain "any"). Prefer listing the specific domains the widget needs.`);
  }

  let port;
  if (entry.port !== undefined) {
    if (typeof entry.port !== "number" || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) {
      throw new ValidationError(`${label}.port must be an integer between 1 and 65535`);
    }
    port = entry.port;
  }

  const host = domain.toLowerCase();
  if (host === "localhost" && port === undefined) {
    throw new ValidationError(`${label}.port is required when domain is "localhost"`);
  }
  if (isLoopbackHost(host) && host !== "localhost" && port === undefined) {
    warnings.push(`${label} targets loopback address ${domain} without a port; the docs require a port for localhost access.`);
  }
}

function crossCheckPlugins(manifest, permissions, warnings) {
  const plugins = Array.isArray(manifest.required_plugins) ? manifest.required_plugins : [];
  const hasStreamDeckPlugin = plugins.some((plugin) => typeof plugin === "string" && plugin.startsWith(STREAM_DECK_PLUGIN_PREFIX));
  const hasFileSystemPlugin = plugins.some((plugin) => typeof plugin === "string" && plugin.startsWith(FILE_SYSTEM_PLUGIN_PREFIX));
  const hasStreamDeckPermission = permissions.some((p) => p.type === "application" && typeof p.application === "string" && p.application.trim().toLowerCase() === "stream deck");
  const hasPathPermission = permissions.some((p) => p.type === "file" || p.type === "folder");

  if (hasStreamDeckPlugin && !hasStreamDeckPermission) {
    warnings.push(
      'required_plugins includes the Stream Deck plugin but manifest.permissions has no { "type": "application", "application": "Stream Deck" } entry. ' +
        "iCUE will ask the user at runtime and the plugin cannot connect until they approve; pre-declare it so it is shown at install.",
    );
  }
  if (hasStreamDeckPermission && !hasStreamDeckPlugin) {
    warnings.push('manifest.permissions declares the "Stream Deck" application permission but required_plugins does not include widgetbuilder.streamdeck.');
  }
  if (hasFileSystemPlugin && !hasPathPermission) {
    warnings.push(
      "required_plugins includes the File System plugin but manifest.permissions has no file or folder permission. " +
        "watchPath() is silently blocked for paths without one.",
    );
  }
}

function permissionKey(entry) {
  const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : value);
  switch (entry?.type) {
    case "file":
    case "folder":
      return `${entry.type}|${normalizePath(entry.path)}`;
    case "url":
      return `url|${normalize(entry.domain)}|${entry.port ?? ""}`;
    case "self_signed_certificate":
      return `${entry.type}|${normalize(entry.host)}`;
    case "application":
      return `${entry.type}|${normalize(entry.application)}`;
    default:
      return String(entry?.type);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
}

function isLoopbackHost(host) {
  return host === "localhost" || LOOPBACK_V4_RE.test(host) || host === "::1" || host === "[::1]";
}

function normalizePath(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Code-vs-manifest audit (heuristic; always warnings)
// ---------------------------------------------------------------------------

const QUOTE = "([\"'`])";
const FETCH_LITERAL_RE = new RegExp(`\\b(fetch|EventSource)\\s*\\(\\s*${QUOTE}((?:https?|wss?):\\/\\/[^"'\`\\s]*?)\\2`, "g");
const BEACON_LITERAL_RE = new RegExp(`\\bnavigator\\.sendBeacon\\s*\\(\\s*${QUOTE}((?:https?|wss?):\\/\\/[^"'\`\\s]*?)\\1`, "g");
const WEBSOCKET_LITERAL_RE = new RegExp(`\\bnew\\s+WebSocket\\s*\\(\\s*${QUOTE}((?:https?|wss?):\\/\\/[^"'\`\\s]*?)\\1`, "g");
const XHR_LITERAL_RE = new RegExp(`\\.open\\s*\\(\\s*${QUOTE}[A-Za-z]+\\1\\s*,\\s*${QUOTE}((?:https?|wss?):\\/\\/[^"'\`\\s]*?)\\2`, "g");
const DYNAMIC_FETCH_RE = /\b(?:fetch|EventSource)\s*\(\s*(?!["'`])[^\s)]/g;
const DYNAMIC_WEBSOCKET_RE = /\bnew\s+WebSocket\s*\(\s*(?!["'`])[^\s)]/g;
const WATCH_PATH_LITERAL_RE = new RegExp(`\\.watchPath\\s*\\(\\s*${QUOTE}([^"'\`]*)\\1`, "g");
const WATCH_PATH_ANY_RE = /\.watchPath\s*\(/g;

const API_CHECKS = [
  {
    label: "getUserMedia()",
    re: /\bgetUserMedia\s*\(/,
    needs: ["microphone", "camera"],
    any: true,
  },
  { label: "getDisplayMedia()", re: /\bgetDisplayMedia\s*\(/, needs: ["screen"] },
  { label: "navigator.clipboard", re: /\bnavigator\.clipboard\b/, needs: ["clipboard_read_write"] },
  { label: "queryLocalFonts()", re: /\bqueryLocalFonts\s*\(/, needs: ["local_fonts_access"] },
  {
    label: "audio playback (<audio>, new Audio(), AudioContext)",
    re: /<audio\b|\bnew\s+Audio\s*\(|\bAudioContext\b/,
    needs: ["speaker"],
  },
  {
    label: "file download (download attribute or .download =)",
    re: /(?<![\w-])download\s*=\s*["'`]|\.download\s*=/,
    needs: ["download"],
  },
];

// Heuristic scan of the widget's own HTML/JS for calls that need a manifest permission.
// It only emits warnings: literal URLs and paths can be checked precisely, dynamic ones
// cannot, and commented-out code can trigger false positives. Bundled iCUE tools under
// common/ are skipped.
export function auditPermissionUsage(sources, manifest, warnings) {
  const permissions = getPermissions(manifest);
  const urlPermissions = permissions.filter((p) => p.type === "url");
  const pathPermissions = permissions.filter((p) => p.type === "file" || p.type === "folder");
  const declared = new Set(permissions.map((p) => p.type));
  const emitted = new Set(warnings);
  const warn = (message) => {
    if (!emitted.has(message)) {
      emitted.add(message);
      warnings.push(message);
    }
  };

  for (const { label, code } of sources) {
    if (isBundledCommonFile(label)) continue;

    let sawLiteralNetworkCall = false;
    for (const url of collectUrlLiterals(code)) {
      sawLiteralNetworkCall = true;
      const target = parseTarget(url.value);
      if (!target) continue;
      if (!urlPermissions.some((p) => urlPermissionCovers(p, target))) {
        warn(
          `${label}: ${url.call} to ${target.host}${target.explicitPort ? `:${target.port}` : ""} has no matching url permission. ` +
            `Add { "type": "url", "domain": "${target.host}"${target.isLocal || target.explicitPort ? `, "port": ${target.port}` : ""} } to manifest.permissions.`,
        );
      }
    }
    if (!sawLiteralNetworkCall && urlPermissions.length === 0) {
      const call = firstMatch(code, [DYNAMIC_FETCH_RE, DYNAMIC_WEBSOCKET_RE]);
      if (call) {
        warn(
          `${label}: network call with a non-literal URL (${call.trim()}) but manifest.permissions declares no url permission. ` +
            `If it can reach an external host or localhost, declare a url permission for it.`,
        );
      }
    }

    for (const watch of collectWatchPaths(code)) {
      if (watch.dynamic) {
        if (pathPermissions.length === 0) {
          warn(`${label}: watchPath() is called but manifest.permissions has no file or folder permission; the path is silently blocked without one.`);
        }
        continue;
      }
      if (!pathPermissions.some((p) => pathPermissionCovers(p, watch.value))) {
        const manifestPath = watch.value.replace(/^\{([A-Za-z]+)\}/, "<$1>");
        warn(
          `${label}: watchPath("${watch.value}") is not covered by a file or folder permission. ` +
            `Add { "type": "file" or "folder", "path": "${manifestPath}" } to manifest.permissions (manifest paths use <Macro>, watchPath uses {Macro}).`,
        );
      }
    }

    for (const check of API_CHECKS) {
      if (!check.re.test(code)) continue;
      const satisfied = check.any ? check.needs.some((t) => declared.has(t)) : check.needs.every((t) => declared.has(t));
      if (!satisfied) {
        warn(
          `${label}: uses ${check.label} but manifest.permissions has no ${check.needs.map((t) => `"${t}"`).join(check.any ? " or " : " and ")} permission.`,
        );
      }
    }
  }
}

function isBundledCommonFile(label) {
  return /^(?:\.\/)?common[\\/]/.test(label);
}

function* collectUrlLiterals(code) {
  for (const [re, call, group] of [
    [FETCH_LITERAL_RE, null, 3],
    [BEACON_LITERAL_RE, "navigator.sendBeacon()", 2],
    [WEBSOCKET_LITERAL_RE, "WebSocket", 2],
    [XHR_LITERAL_RE, "XMLHttpRequest", 3],
  ]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(code))) {
      yield { call: call ?? `${match[1]}()`, value: match[group] };
    }
  }
}

function* collectWatchPaths(code) {
  WATCH_PATH_LITERAL_RE.lastIndex = 0;
  let literalCount = 0;
  let match;
  while ((match = WATCH_PATH_LITERAL_RE.exec(code))) {
    literalCount += 1;
    const value = match[2];
    if (value.includes("${")) yield { dynamic: true };
    else yield { dynamic: false, value };
  }
  WATCH_PATH_ANY_RE.lastIndex = 0;
  let total = 0;
  while (WATCH_PATH_ANY_RE.exec(code)) total += 1;
  for (let i = literalCount; i < total; i += 1) yield { dynamic: true };
}

function firstMatch(code, regexes) {
  for (const re of regexes) {
    re.lastIndex = 0;
    const match = re.exec(code);
    if (match) return match[0];
  }
  return null;
}

// Template literals can embed expressions; if the host itself is dynamic we cannot check it.
function parseTarget(value) {
  const afterScheme = value.slice(value.indexOf("://") + 3);
  const authority = afterScheme.split(/[/?#]/, 1)[0];
  if (authority.includes("${")) return null;
  let url;
  try {
    url = new URL(value.replace(/\$\{[^}]*\}/g, "x"));
  } catch {
    return null;
  }
  const defaultPort = url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return {
    host,
    port: url.port ? Number(url.port) : defaultPort,
    explicitPort: Boolean(url.port),
    isLocal: isLoopbackHost(host),
  };
}

function urlPermissionCovers(permission, target) {
  if (typeof permission.domain !== "string") return false;
  const domain = permission.domain.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (permission.port !== undefined && permission.port !== target.port) return false;
  if (domain === "any") return !target.isLocal;
  if (target.host === domain) return true;
  const isIp = /^[\d.]+$/.test(domain) || domain.includes(":");
  return !isIp && target.host.endsWith(`.${domain}`);
}

function pathPermissionCovers(permission, watchedPath) {
  const granted = normalizePath(permission.path);
  const watched = normalizePath(watchedPath.replace(/^\{([A-Za-z]+)\}/, "<$1>"));
  if (!granted) return false;
  if (permission.type === "file") return watched === granted;
  return watched === granted || watched.startsWith(`${granted}/`);
}
