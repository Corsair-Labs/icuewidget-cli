import test from "node:test";
import assert from "node:assert/strict";
import { checkHeadRules } from "../src-node/head-rules.js";
const doc = (head, body = "<div></div>") => `<!DOCTYPE html>\n<html>\n<head>\n<title>'W'</title>\n${head}\n</head>\n<body>${body}</body></html>`;
test("clean head passes", () => assert.deepEqual(checkHeadRules(doc('<script type="application/json" id="x-icue-groups">[]</script>'), "W"), { errors: [], warnings: [] }));
test("non-ASCII is an error with line", () => assert.match(checkHeadRules(doc("<!-- a \u2014 b -->"), "W").errors[0], /line 5: non-ASCII character U\+2014/));
test("<header> in body is an error", () => assert.match(checkHeadRules(doc("", "<header>x</header>"), "W").errors[0], /<header/));
test("inline style/script warn", () => assert.equal(checkHeadRules(doc("<style>a{}</style><script>1</script>"), "W").warnings.length, 2));
const titled = (title) => doc("").replace("<title>'W'</title>", `<title>${title}</title>`);
test("title mismatch warns", () => assert.match(checkHeadRules(doc(""), "X").warnings[0], /manifest.name is "X"/));
test("tr('W') and tr(\"W\") titles pass", () => {
  assert.deepEqual(checkHeadRules(titled("tr('W')"), "W"), { errors: [], warnings: [] });
  assert.deepEqual(checkHeadRules(titled('tr("W")'), "W"), { errors: [], warnings: [] });
});
test("double-quoted literal title passes", () => assert.deepEqual(checkHeadRules(titled('"W"'), "W"), { errors: [], warnings: [] }));
test("tr() title mismatch warns", () => assert.match(checkHeadRules(titled("tr('Other')"), "W").warnings[0], /names "Other"/));
test("bare title warns about ReferenceError", () => {
  const { errors, warnings } = checkHeadRules(titled("W"), "W");
  assert.equal(errors.length, 0);
  assert.match(warnings[0], /bare text.*ReferenceError.*tr\('W'\).*'W'/);
});
test("multi-word bare title warns", () => assert.match(checkHeadRules(titled("My Widget"), "My Widget").warnings[0], /bare text/));
test("other title expressions are not checked", () => assert.deepEqual(checkHeadRules(titled("tr('W') + ' Pro'"), "X").warnings, []));
test("BOM warns", () => assert.match(checkHeadRules("\ufeff" + doc(""), "W").warnings[0], /BOM/));
