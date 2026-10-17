// Extra head checks (0.5.1-local). iCUE parses everything up to </head> as strict XML and
// reports "Missing Title Element" on any failure. xml-head.js covers well-formedness; this
// covers the rules found on real widgets that are well-formed but still fail import, plus
// best-practice warnings. Returns { errors: string[], warnings: string[] } with line numbers.

const lineOf = (src, pos) => src.slice(0, pos).split("\n").length;

const decode = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

export function checkHeadRules(html, manifestName) {
  const errors = [];
  const warnings = [];
  const add = (list, pos, msg) => list.push(`index.html line ${lineOf(html, pos)}: ${msg}`);

  if (html.charCodeAt(0) === 0xfeff) {
    warnings.push("index.html starts with a UTF-8 BOM. Save it as UTF-8 without BOM so the file begins with <!DOCTYPE html>.");
  }

  const headEnd = html.search(/<\/head\s*>/);
  if (headEnd === -1) return { errors, warnings };
  const head = html.slice(0, headEnd);

  // 1. Non-ASCII anywhere up to </head> (comments, titles, attribute values, inline code).
  const nonAscii = /[^\x00-\x7f]/g;
  let m;
  const seenLines = new Set();
  while ((m = nonAscii.exec(head))) {
    const line = lineOf(html, m.index);
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    const cp = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    add(errors, m.index, `non-ASCII character U+${cp} ${JSON.stringify(m[0])} in <head>. iCUE rejects the widget ("Missing Title Element"). Use ASCII only (e.g. "-" instead of an em dash, no mojibake in comments); put translated text in translation.json.`);
  }

  // 2. Inline <style>/<script> in head (other than the x-icue-groups JSON).
  const blockRe = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  while ((m = blockRe.exec(head))) {
    const [, tag, attrs, body] = m;
    if (tag.toLowerCase() === "script" && /\bid=["']x-icue-groups["']/i.test(attrs)) continue;
    if (tag.toLowerCase() === "script" && /\bsrc=/i.test(attrs) && !body.trim()) continue;
    add(warnings, m.index, `inline <${tag.toLowerCase()}> block in <head>. Its content is parsed as strict XML (any '<', '&' or '--' breaks import). Move CSS/JS to <body> or an external file; only the x-icue-groups script belongs in <head>.`);
  }

  // 3. Title: exactly one, non-empty, plain text matching manifest.name.
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
  if (titles.length > 1) add(errors, titles[1].index, `<head> has ${titles.length} <title> elements; keep exactly one.`);
  if (titles.length >= 1 && typeof manifestName === "string") {
    const raw = titles[0][1].trim();
    const tr = /^tr\((['"])(.*)\1\)$/.exec(raw);
    const text = decode(tr ? tr[2] : raw);
    if (text !== manifestName.trim()) {
      add(warnings, titles[0].index, `<title> "${raw}" does not match manifest.name "${manifestName}". Use the manifest name as plain text.`);
    } else if (tr) {
      add(warnings, titles[0].index, `<title> uses ${raw}; prefer plain text identical to manifest.name.`);
    }
  }

  // 4. "</head" / "<head" look-alikes after </head> (e.g. <header>, </header>).
  // Seen on AgentPad: head is valid ASCII XML, but the body's </header> makes iCUE cut the
  // head at the wrong place and the import fails with "Missing Title Element".
  const after = html.slice(headEnd + 1);
  const offset = headEnd + 1;
  const bad = [];
  const re = /<\/?(head[a-z0-9-]*)\b/gi;
  while ((m = re.exec(after))) bad.push(m);
  if (bad.length) {
    const first = bad[0];
    const lines = [...new Set(bad.map((b) => lineOf(html, offset + b.index)))].slice(0, 8).join(", ");
    errors.push(
      `index.html line ${lines}: "${first[0]}" after </head>. iCUE locates the head by text and treats <header>/</header> (or any "<head" string in the body or inline scripts) as the head boundary, so the import fails with "Missing Title Element". Use <div class="header"> or <section> and avoid literal "<head" text; build such strings in external JS.`
    );
  }

  return { errors, warnings };
}
