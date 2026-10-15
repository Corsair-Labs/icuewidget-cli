import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ValidationError, validateWidget } from "../src-node/validation.js";

const HEAD_META = [
  '<meta charset="utf-8" />',
  "<title>T</title>",
  '<link rel="icon" href="resources/icon.svg" />',
  '<link rel="stylesheet" href="styles/main.css" />',
].join("");

async function makeWidget(dir, { head = HEAD_META } = {}) {
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
    min_app_version: "5.47",
    min_framework_version: "1.0.0",
    os: [{ platform: "windows" }],
    supported_devices: [{ type: "dashboard_lcd" }],
  }), "utf8");
  await fs.writeFile(path.join(dir, "translation.json"), "{}", "utf8");
  await fs.writeFile(path.join(dir, "resources", "icon.svg"), "<svg/>", "utf8");
  await fs.writeFile(path.join(dir, "styles", "main.css"), "body { color: red; }", "utf8");
  await fs.writeFile(path.join(dir, "scripts", "main.js"), "window.icueEvents = {};", "utf8");
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<html><head>${head}</head><body><script src="scripts/main.js"></script></body></html>`,
    "utf8"
  );
}

async function tmpWidget(head) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "icuewidget-validate-"));
  await makeWidget(dir, { head });
  return dir;
}

test("accepts valid x-icue-property data-type values", async () => {
  const dir = await tmpWidget(
    HEAD_META +
      '<meta name="x-icue-property" content="title" data-label="tr(\'Title\')" data-type="textfield" data-default="\'Hi\'" />' +
      '<meta name="x-icue-property" content="show" data-label="tr(\'Show\')" data-type="switch" data-default="true" />'
  );
  const result = await validateWidget(dir);
  assert.equal(result.manifest.name, "TestWidget");
});

test("rejects unknown x-icue-property data-type", async () => {
  const dir = await tmpWidget(
    HEAD_META + '<meta name="x-icue-property" content="title" data-label="tr(\'Title\')" data-type="text" data-default="\'Hi\'" />'
  );
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /invalid data-type "text"/i);
    return true;
  });
});

test("rejects x-icue-property missing data-type", async () => {
  const dir = await tmpWidget(
    HEAD_META + '<meta name="x-icue-property" content="title" data-label="tr(\'Title\')" data-default="\'Hi\'" />'
  );
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /missing a data-type/i);
    return true;
  });
});

test("rejects non-self-closed void element in head", async () => {
  const dir = await tmpWidget('<meta charset="utf-8"><title>T</title>');
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /non-self-closed <meta>/i);
    return true;
  });
});

test("accepts a valid x-icue-groups script", async () => {
  const dir = await tmpWidget(
    HEAD_META +
      '<meta name="x-icue-property" content="a" data-label="tr(\'A\')" data-type="textfield" data-default="\'\'" />' +
      '<script id="x-icue-groups" type="application/json">[{"title":"tr(\'Main\')","properties":["a"]}]</script>'
  );
  const result = await validateWidget(dir);
  assert.equal(result.manifest.name, "TestWidget");
});

test("rejects malformed x-icue-groups JSON", async () => {
  const dir = await tmpWidget(
    HEAD_META + '<script id="x-icue-groups" type="application/json">[{"title":"tr(\'Main\')",}]</script>'
  );
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /x-icue-groups is not valid JSON/i);
    return true;
  });
});

test("rejects x-icue-groups group with no properties", async () => {
  const dir = await tmpWidget(
    HEAD_META + '<script id="x-icue-groups" type="application/json">[{"title":"tr(\'Main\')","properties":[]}]</script>'
  );
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /at least one property/i);
    return true;
  });
});

test("does not warn about icueEvents when a referenced script handles it", async () => {
  const dir = await tmpWidget();
  const result = await validateWidget(dir);
  assert.ok(!result.warnings.some((w) => /icueEvents/.test(w)));
});

test("warns when neither index.html nor referenced scripts reference icueEvents", async () => {
  const dir = await tmpWidget();
  await fs.writeFile(path.join(dir, "scripts", "main.js"), "console.log('hi');", "utf8");
  const result = await validateWidget(dir);
  assert.ok(result.warnings.some((w) => /icueEvents/.test(w)));
});

async function tmpWidgetHtml(html) {
  const dir = await tmpWidget();
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  return dir;
}

const BODY = '<body><p>HTML&nbsp;body <br> is not parsed as XML</p><script src="scripts/main.js"></script></body></html>';

async function rejectsHeadXml(html, pattern) {
  const dir = await tmpWidgetHtml(html);
  await assert.rejects(validateWidget(dir), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /not well-formed XML/i);
    assert.match(error.message, pattern);
    return true;
  });
}

test("accepts uppercase DOCTYPE and HTML-only syntax after </head>", async () => {
  const dir = await tmpWidgetHtml(`<!DOCTYPE html>\n<html lang="en">\n<head>${HEAD_META}</head>${BODY}`);
  const result = await validateWidget(dir);
  assert.equal(result.manifest.name, "TestWidget");
});

test("rejects lowercase doctype", async () => {
  await rejectsHeadXml(`<!doctype html>\n<html lang="en"><head>${HEAD_META}</head>${BODY}`, /line 1, column 1: DOCTYPE must be uppercase/);
});

test("rejects inline head script that is not valid XML", async () => {
  await rejectsHeadXml(
    `<!DOCTYPE html><html><head>${HEAD_META}<script>if (a && b) {}</script></head>${BODY}`,
    /Bare '&'.*Inline <script>/
  );
});

test("rejects HTML-only entity in head", async () => {
  await rejectsHeadXml(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>A&nbsp;B</title></head>${BODY}`, /Undefined entity &nbsp;/);
});

test("rejects boolean attribute in head", async () => {
  await rejectsHeadXml(`<!DOCTYPE html><html><head>${HEAD_META}<script defer src="scripts/main.js"></script></head>${BODY}`, /"defer".*has no value/);
});

test("rejects unquoted attribute in head", async () => {
  await rejectsHeadXml(`<!DOCTYPE html><html lang=en><head>${HEAD_META}</head>${BODY}`, /must be quoted/);
});

test("rejects head without a title", async () => {
  const dir = await tmpWidget('<meta charset="utf-8" /><link rel="icon" href="resources/icon.svg" />');
  await assert.rejects(validateWidget(dir), /no non-empty <title>/);
});
