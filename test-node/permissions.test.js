import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ValidationError, validateWidget } from "../src-node/validation.js";

const HEAD = [
  '<meta charset="utf-8" />',
  "<title>T</title>",
  '<link rel="icon" href="resources/icon.svg" />',
].join("");

async function tmpWidget({ manifest = {}, script = "window.icueEvents = {};", html, files = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-perm-"));
  await fs.mkdir(path.join(dir, "resources"), { recursive: true });
  await fs.mkdir(path.join(dir, "scripts"));
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      author: "Test",
      id: "com.test.widget",
      name: "TestWidget",
      description: "A test widget",
      version: "1.0.0",
      preview_icon: "resources/icon.svg",
      min_app_version: "5.52",
      min_framework_version: "1.0.0",
      os: [{ platform: "windows" }],
      supported_devices: [{ type: "dashboard_lcd" }],
      ...manifest,
    }),
    "utf8",
  );
  await fs.writeFile(path.join(dir, "translation.json"), "{}", "utf8");
  await fs.writeFile(path.join(dir, "resources", "icon.svg"), "<svg/>", "utf8");
  await fs.writeFile(path.join(dir, "scripts", "main.js"), script, "utf8");
  await fs.writeFile(
    path.join(dir, "index.html"),
    html ?? `<html><head>${HEAD}</head><body><script src="scripts/main.js"></script></body></html>`,
    "utf8",
  );
  for (const [relative, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
    await fs.writeFile(path.join(dir, relative), content, "utf8");
  }
  return dir;
}

async function validate(options) {
  return validateWidget(await tmpWidget(options));
}

async function rejects(options, pattern) {
  const dir = await tmpWidget(options);
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError, `expected ValidationError, got ${error}`);
    assert.match(error.message, pattern);
    return true;
  });
}

// Provable literal mismatches fail validation; every undeclared finding is listed in one error.
async function rejectsAudit(options, includes, excludes = []) {
  const dir = await tmpWidget(options);
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError, `expected ValidationError, got ${error}`);
    assert.match(error.message, /does not declare/);
    for (const pattern of includes) assert.match(error.message, pattern);
    for (const pattern of excludes) assert.doesNotMatch(error.message, pattern);
    return true;
  });
}

function permissionWarnings(result) {
  return result.warnings.filter((w) => !/icueEvents|favicon|translation/.test(w));
}

function assertNoWarnings(result) {
  assert.deepEqual(permissionWarnings(result), []);
}

function assertWarning(result, pattern) {
  assert.ok(result.warnings.some((w) => pattern.test(w)), `no warning matching ${pattern}; got:\n${result.warnings.join("\n")}`);
}

// --- manifest schema -------------------------------------------------------

test("accepts a manifest without permissions", async () => {
  assertNoWarnings(await validate());
});

test("accepts an empty permissions array", async () => {
  assertNoWarnings(await validate({ manifest: { permissions: [] } }));
});

test("accepts every documented permission type", async () => {
  const result = await validate({
    manifest: {
      permissions: [
        { type: "file", path: "<Documents>/my-widget/data.txt" },
        { type: "folder", path: "<AppData>/logs" },
        { type: "url", domain: "api.example.com" },
        { type: "url", domain: "localhost", port: 8080 },
        { type: "microphone" },
        { type: "camera" },
        { type: "speaker" },
        { type: "screen" },
        { type: "clipboard_read_write" },
        { type: "local_fonts_access" },
        { type: "self_signed_certificate", host: "localhost" },
        { type: "download" },
        { type: "application", application: "Stream Deck" },
      ],
      required_plugins: ["widgetbuilder.streamdeck:StreamDeck:1.2"],
    },
  });
  assertNoWarnings(result);
});

test("rejects permissions that is not an array", async () => {
  await rejects({ manifest: { permissions: { type: "url" } } }, /manifest\.permissions must be an array/);
});

test("rejects a permission entry that is not an object", async () => {
  await rejects({ manifest: { permissions: ["url"] } }, /manifest\.permissions\[0\] must be an object/);
  await rejects({ manifest: { permissions: [null] } }, /manifest\.permissions\[0\] must be an object/);
});

test("rejects missing or unknown permission type", async () => {
  await rejects({ manifest: { permissions: [{}] } }, /permissions\[0\]\.type must be one of: file, folder, url/);
  await rejects({ manifest: { permissions: [{ type: "network" }] } }, /type must be one of.*\(got "network"\)/);
});

test("warns about undocumented fields", async () => {
  const result = await validate({ manifest: { permissions: [{ type: "microphone", reason: "voice" }] } });
  assertWarning(result, /permissions\[0\] has field "reason".*"microphone"/);
});

test("warns about duplicate permissions", async () => {
  const result = await validate({
    manifest: { permissions: [{ type: "url", domain: "Example.com" }, { type: "url", domain: "example.com" }] },
  });
  assertWarning(result, /permissions\[1\] duplicates an earlier url permission/);
});

// --- url -------------------------------------------------------------------

test("url: requires a domain", async () => {
  await rejects({ manifest: { permissions: [{ type: "url" }] } }, /permissions\[0\]\.domain must be a non-empty string/);
});

test("url: rejects protocol, path, and embedded port in domain", async () => {
  await rejects({ manifest: { permissions: [{ type: "url", domain: "https://api.example.com" }] } }, /without protocol or path/);
  await rejects({ manifest: { permissions: [{ type: "url", domain: "api.example.com/v1" }] } }, /without protocol or path/);
  await rejects({ manifest: { permissions: [{ type: "url", domain: "api.example.com:8080" }] } }, /must not include a port/);
});

test("url: validates port range and type", async () => {
  for (const port of ["443", 0, 70000, 1.5, null]) {
    await rejects({ manifest: { permissions: [{ type: "url", domain: "example.com", port }] } }, /port must be an integer between 1 and 65535/);
  }
  assertNoWarnings(await validate({ manifest: { permissions: [{ type: "url", domain: "example.com", port: 443 }] } }));
});

test("url: localhost requires a port", async () => {
  await rejects({ manifest: { permissions: [{ type: "url", domain: "localhost" }] } }, /port is required when domain is "localhost"/);
  await rejects({ manifest: { permissions: [{ type: "url", domain: "LocalHost" }] } }, /port is required/);
});

test("url: warns for loopback IP without a port and for domain any", async () => {
  const loopback = await validate({ manifest: { permissions: [{ type: "url", domain: "127.0.0.1" }] } });
  assertWarning(loopback, /loopback address 127\.0\.0\.1 without a port/);
  const any = await validate({ manifest: { permissions: [{ type: "url", domain: "any" }] } });
  assertWarning(any, /every external host/);
});

// --- file / folder ---------------------------------------------------------

test("file/folder: requires a path", async () => {
  await rejects({ manifest: { permissions: [{ type: "file" }] } }, /permissions\[0\]\.path must be a non-empty string/);
  await rejects({ manifest: { permissions: [{ type: "folder", path: "  " }] } }, /path must be a non-empty string/);
});

test("file/folder: rejects relative paths", async () => {
  await rejects({ manifest: { permissions: [{ type: "file", path: "data/config.json" }] } }, /absolute path or start with a <Macro>/);
});

test("file/folder: rejects curly-brace macros with a targeted hint", async () => {
  await rejects({ manifest: { permissions: [{ type: "folder", path: "{Documents}/x" }] } }, /curly braces.*<Macro> angle brackets/s);
});

test("file/folder: rejects unknown and malformed macros", async () => {
  await rejects({ manifest: { permissions: [{ type: "file", path: "<Desktopp>/x.txt" }] } }, /unknown macro <Desktopp>/);
  await rejects({ manifest: { permissions: [{ type: "file", path: "<Documents/x.txt" }] } }, /malformed <Macro> prefix/);
  await rejects({ manifest: { permissions: [{ type: "file", path: "<Documents>x.txt" }] } }, /malformed <Macro> prefix/);
});

test("file/folder: accepts every documented macro and absolute paths", async () => {
  const macros = ["Home", "Desktop", "Documents", "Downloads", "Music", "Pictures", "Movies", "Temp", "AppData", "Runtime"];
  const permissions = [
    ...macros.map((macro) => ({ type: "folder", path: `<${macro}>/my-widget` })),
    { type: "file", path: "<Documents>" },
    { type: "file", path: "C:/Users/me/data.txt" },
    { type: "file", path: "C:\\Users\\me\\other.txt" },
    { type: "folder", path: "/Users/me/data" },
  ];
  assertNoWarnings(await validate({ manifest: { permissions } }));
});

test("file/folder: warns about wrong-case macro, '..', trailing separator on file, and mid-path macros", async () => {
  const result = await validate({
    manifest: {
      permissions: [
        { type: "file", path: "<documents>/x.txt" },
        { type: "folder", path: "<Documents>/../secret" },
        { type: "file", path: "<Documents>/folder/" },
        { type: "folder", path: "<Documents>/<Temp>/x" },
      ],
    },
  });
  assertWarning(result, /uses <documents>; the documented spelling is <Documents>/);
  assertWarning(result, /contains "\.\." segments/);
  assertWarning(result, /ends with a path separator but the permission type is "file"/);
  assertWarning(result, /another <Macro> after the prefix/);
});

// --- self_signed_certificate / application ---------------------------------

test("self_signed_certificate: requires a bare host", async () => {
  await rejects({ manifest: { permissions: [{ type: "self_signed_certificate" }] } }, /permissions\[0\]\.host must be a non-empty string/);
  await rejects({ manifest: { permissions: [{ type: "self_signed_certificate", host: "https://localhost" }] } }, /bare hostname/);
});

test("application: requires a name and warns for unknown applications", async () => {
  await rejects({ manifest: { permissions: [{ type: "application" }] } }, /permissions\[0\]\.application must be a non-empty string/);
  const result = await validate({ manifest: { permissions: [{ type: "application", application: "OBS" }] } });
  assertWarning(result, /"OBS" is not a documented application/);
});

test("application: matching is case-insensitive and duplicates are flagged", async () => {
  const result = await validate({
    manifest: {
      required_plugins: ["widgetbuilder.streamdeck:StreamDeck:1.2"],
      permissions: [{ type: "application", application: "Stream Deck" }, { type: "application", application: "stream deck" }],
    },
  });
  assertWarning(result, /duplicates an earlier application permission/);
  assert.ok(!result.warnings.some((w) => /Stream Deck plugin but/.test(w)));
});

// --- plugin cross-checks ---------------------------------------------------

test("warns when the Stream Deck plugin has no application permission", async () => {
  const result = await validate({ manifest: { required_plugins: ["widgetbuilder.streamdeck:StreamDeck:1.2"] } });
  assertWarning(result, /Stream Deck plugin but manifest\.permissions has no .*"application".*"Stream Deck"/);
});

test("warns when the Stream Deck permission has no plugin", async () => {
  const result = await validate({ manifest: { permissions: [{ type: "application", application: "Stream Deck" }] } });
  assertWarning(result, /"Stream Deck" application permission but required_plugins does not include widgetbuilder\.streamdeck/);
});

test("warns when the File System plugin has no file or folder permission", async () => {
  const result = await validate({ manifest: { required_plugins: ["widgetbuilder.filesystemprovider:FileSystem:1.0"] } });
  assertWarning(result, /File System plugin but manifest\.permissions has no file or folder/);
  const ok = await validate({
    manifest: {
      required_plugins: ["widgetbuilder.filesystemprovider:FileSystem:1.0"],
      permissions: [{ type: "folder", path: "<Documents>/w" }],
    },
  });
  assert.ok(!ok.warnings.some((w) => /File System plugin/.test(w)));
});

test("accepts the stream-deck-virtual-device control type", async () => {
  const html =
    `<html><head>${HEAD}<meta name="x-icue-property" content="virtualDevice" data-label="tr('Virtual Device')" data-type="stream-deck-virtual-device" />` +
    '</head><body><script src="scripts/main.js"></script></body></html>';
  const result = await validate({ html });
  assert.equal(result.manifest.name, "TestWidget");
});

// --- code vs manifest audit --------------------------------------------------

const urlPerm = (domain, port) => ({ type: "url", domain, ...(port ? { port } : {}) });

test("audit: fetch to an undeclared host fails with a suggested entry", async () => {
  await rejectsAudit(
    { script: "window.icueEvents = {}; fetch('https://api.example.com/v1/data');" },
    [/scripts\/main\.js: fetch\(\) to api\.example\.com has no matching url permission.*"domain": "api\.example\.com"/],
  );
});

test("audit: a widget with no permissions key still fails on an undeclared literal host", async () => {
  const dir = await tmpWidget({ script: "window.icueEvents = {}; fetch('https://api.example.com/v1/data');" });
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  assert.equal(manifest.permissions, undefined);
  await assert.rejects(validateWidget(dir), /api\.example\.com has no matching url permission/);
});

test("audit: declared host (and parent domain) silences the warning", async () => {
  const script = "window.icueEvents = {}; fetch('https://api.example.com/v1/data');";
  assertNoWarnings(await validate({ script, manifest: { permissions: [urlPerm("api.example.com")] } }));
  assertNoWarnings(await validate({ script, manifest: { permissions: [urlPerm("example.com")] } }));
});

test("audit: a sibling or lookalike domain fails", async () => {
  const script = "window.icueEvents = {}; fetch('https://badexample.com/x');";
  await rejectsAudit({ script, manifest: { permissions: [urlPerm("example.com")] } }, [/badexample\.com has no matching url permission/]);
});

test("audit: port must match the declared port", async () => {
  const script = "window.icueEvents = {}; fetch('https://api.example.com/x'); fetch('http://api.example.com:8080/y');";
  await rejectsAudit(
    { script, manifest: { permissions: [urlPerm("api.example.com", 443)] } },
    [/api\.example\.com:8080 has no matching url permission/],
    [/to api\.example\.com has no matching/],
  );
});

test("audit: domain any covers external hosts but not localhost", async () => {
  const script = "window.icueEvents = {}; fetch('https://api.example.com/x'); fetch('http://localhost:8080/y');";
  await rejectsAudit(
    { script, manifest: { permissions: [urlPerm("any")] } },
    [/to localhost:8080 has no matching url permission/],
    [/to api\.example\.com has no matching/],
  );
});

test("audit: localhost with the declared port is covered", async () => {
  const script = "window.icueEvents = {}; fetch('http://localhost:8080/y');";
  assertNoWarnings(await validate({ script, manifest: { permissions: [urlPerm("localhost", 8080)] } }));
});

test("audit: WebSocket, EventSource, XMLHttpRequest, and sendBeacon literals are checked", async () => {
  const script = [
    "window.icueEvents = {};",
    "new WebSocket('wss://ws.example.com/feed');",
    "new EventSource(\"https://sse.example.com/stream\");",
    "const x = new XMLHttpRequest(); x.open('GET', 'https://xhr.example.com/a');",
    "navigator.sendBeacon('https://beacon.example.com/b', '');",
  ].join("\n");
  await rejectsAudit(
    { script },
    ["ws.example.com", "sse.example.com", "xhr.example.com", "beacon.example.com"].map(
      (host) => new RegExp(`to ${host.replace(/\./g, "\\.")} has no matching url permission`),
    ),
  );
});

test("audit: template-literal URLs are checked by host; dynamic hosts are skipped", async () => {
  const script = "window.icueEvents = {}; const c = 'x'; fetch(`https://api.example.com/q?c=${c}`); fetch(`https://${c}.example.org/q`);";
  await rejectsAudit({ script }, [/to api\.example\.com has no matching url permission/], [/example\.org/]);
});

test("audit: relative fetch needs no url permission", async () => {
  assertNoWarnings(await validate({ script: "window.icueEvents = {}; fetch('data/local.json'); fetch('./x.json');" }));
});

test("audit: a non-literal network call with no url permission warns once", async () => {
  const result = await validate({ script: "window.icueEvents = {}; const u = getUrl(); fetch(u); fetch(u + '/b');" });
  const matches = result.warnings.filter((w) => /non-literal URL/.test(w));
  assert.equal(matches.length, 1);
});

test("audit: a non-literal network call is quiet when url permissions exist", async () => {
  const result = await validate({
    script: "window.icueEvents = {}; fetch(getUrl());",
    manifest: { permissions: [urlPerm("api.example.com")] },
  });
  assert.ok(!result.warnings.some((w) => /non-literal URL/.test(w)));
});

test("audit: inline scripts and manifest modules are scanned; bundled common/ files are not", async () => {
  const html = `<html><head>${HEAD}</head><body><script>window.icueEvents = {}; fetch('https://inline.example.com/x');</script></body></html>`;
  await rejectsAudit(
    {
      html,
      manifest: { modules: ["modules/Search.mjs"] },
      files: {
        "modules/Search.mjs": "export async function search() { return fetch('https://module.example.com/s'); }",
        "common/tools/thing.js": "fetch('https://common.example.com/c');",
      },
    },
    [/index\.html: fetch\(\) to inline\.example\.com/, /modules\/Search\.mjs: fetch\(\) to module\.example\.com/],
    [/common\.example\.com/],
  );
});

test("audit: hardware, clipboard, font, audio, and download APIs need their permissions", async () => {
  const cases = [
    ["navigator.mediaDevices.getUserMedia({ audio: true });", /getUserMedia\(\).*"microphone" or "camera"/, "microphone"],
    ["navigator.mediaDevices.getDisplayMedia({ video: true });", /getDisplayMedia\(\).*"screen"/, "screen"],
    ["navigator.clipboard.writeText('x');", /navigator\.clipboard.*"clipboard_read_write"/, "clipboard_read_write"],
    ["window.queryLocalFonts();", /queryLocalFonts\(\).*"local_fonts_access"/, "local_fonts_access"],
    ["new Audio('resources/a.mp3').play();", /audio playback.*"speaker"/, "speaker"],
    ["const a = document.createElement('a'); a.download = 'x.txt';", /file download.*"download"/, "download"],
  ];
  for (const [code, pattern, type] of cases) {
    const script = `window.icueEvents = {}; ${code}`;
    assertWarning(await validate({ script }), pattern);
    assertNoWarnings(await validate({ script, manifest: { permissions: [{ type }] } }));
  }
  // getUserMedia is satisfied by either camera or microphone.
  assertNoWarnings(
    await validate({ script: "window.icueEvents = {}; navigator.mediaDevices.getUserMedia({ video: true });", manifest: { permissions: [{ type: "camera" }] } }),
  );
});

test("audit: <audio> markup in index.html needs the speaker permission", async () => {
  const html = `<html><head>${HEAD}</head><body><audio src="resources/a.mp3"></audio><script src="scripts/main.js"></script></body></html>`;
  assertWarning(await validate({ html, files: { "resources/a.mp3": "" } }), /index\.html: uses audio playback/);
});

test("audit: watchPath literals must fall inside a declared file or folder (error)", async () => {
  const script = "window.icueEvents = {}; p.watchPath('{Documents}/icue-test-watch/watch.txt');";
  await rejectsAudit({ script }, [/watchPath\("\{Documents\}\/icue-test-watch\/watch\.txt"\) is not covered.*<Documents>\/icue-test-watch\/watch\.txt/]);
  assertNoWarnings(await validate({ script, manifest: { permissions: [{ type: "file", path: "<Documents>/icue-test-watch/watch.txt" }] } }));
  assertNoWarnings(await validate({ script, manifest: { permissions: [{ type: "folder", path: "<Documents>/icue-test-watch" }] } }));
  assertNoWarnings(await validate({ script, manifest: { permissions: [{ type: "folder", path: "<Documents>/icue-test-watch/" }] } }));
});

test("audit: watchPath is not covered by a sibling folder or a different file", async () => {
  const script = "window.icueEvents = {}; p.watchPath('{Documents}/icue-test-watch2/x.txt');";
  await rejectsAudit({ script, manifest: { permissions: [{ type: "folder", path: "<Documents>/icue-test-watch" }] } }, [/is not covered/]);
  const fileScript = "window.icueEvents = {}; p.watchPath('{Documents}/a/other.txt');";
  await rejectsAudit({ script: fileScript, manifest: { permissions: [{ type: "file", path: "<Documents>/a/watch.txt" }] } }, [/is not covered/]);
});

test("audit: dynamic watchPath without any file/folder permission warns", async () => {
  const result = await validate({ script: "window.icueEvents = {}; p.watchPath(currentPath);" });
  assertWarning(result, /watchPath\(\) is called but manifest\.permissions has no file or folder permission/);
});

test("audit: declaring permissions without calls is not flagged (usage cannot be proven)", async () => {
  assertNoWarnings(await validate({ manifest: { permissions: [urlPerm("api.example.com"), { type: "microphone" }] } }));
});
