// Strict XML well-formedness check for the start of index.html up to and including </head>.
//
// iCUE imports a widget by parsing the document head with a strict XML parser (Qt). Anything
// that is valid HTML but not valid XML (lowercase <!doctype> - confirmed by test import 2026-10-21,
// two otherwise identical widgets, only the uppercase one imported -, unclosed void elements, unquoted
// or valueless attributes, bare `&` or `<` in inline scripts, HTML-only entities like &nbsp;)
// makes the parse fail, and iCUE reports "Missing Title Element" even when <title> is present.
// The scanner stops as soon as </head> closes, so the <body> is free to be ordinary HTML.

const NAME_RE = /[A-Za-z_:][-A-Za-z0-9_.:]*/y;
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y;
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

class XmlError extends Error {
  constructor(message, pos, hint) {
    super(message);
    this.pos = pos;
    this.hint = hint;
  }
}

// Returns null when the prefix through </head> is well-formed XML (or there is no </head>),
// otherwise { message, line, column, hint }.
export function findHeadXmlError(html) {
  try {
    scan(html);
    return null;
  } catch (error) {
    if (!(error instanceof XmlError)) throw error;
    return { message: error.message, hint: error.hint, ...lineColumn(html, error.pos) };
  }
}

function scan(src) {
  let pos = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack = [];

  const fail = (message, at = pos, hint) => {
    throw new XmlError(message, at, hint);
  };
  const startsWith = (token) => src.startsWith(token, pos);
  const skipWs = () => {
    while (pos < src.length && /[ \t\r\n]/.test(src[pos])) pos += 1;
  };
  const readName = () => {
    NAME_RE.lastIndex = pos;
    const match = NAME_RE.exec(src);
    if (!match) fail(`Expected a name but found ${describe(src, pos)}`);
    pos += match[0].length;
    return match[0];
  };
  const skipPast = (terminator, what, start) => {
    const end = src.indexOf(terminator, pos);
    if (end === -1) fail(`Unterminated ${what}`, start);
    const body = src.slice(pos, end);
    pos = end + terminator.length;
    return body;
  };
  const checkEntities = (text, offset) => {
    for (let i = text.indexOf("&"); i !== -1; i = text.indexOf("&", i + 1)) {
      ENTITY_RE.lastIndex = i;
      if (!ENTITY_RE.test(text)) {
        const ref = /^&[A-Za-z0-9#]*;?/.exec(text.slice(i))[0];
        fail(
          ref.length > 1 && ref.endsWith(";")
            ? `Undefined entity ${ref} (XML only knows &amp; &lt; &gt; &quot; &apos; and numeric references)`
            : "Bare '&' must be written as &amp;",
          offset + i,
          currentHint()
        );
      }
    }
  };
  const currentHint = () => {
    const top = stack.at(-1);
    if (top && (top.name.toLowerCase() === "script" || top.name.toLowerCase() === "style")) {
      return `Inline <${top.name}> content in <head> is parsed as XML too. Move the code into an external file or into <body>.`;
    }
    return undefined;
  };
  const comment = () => {
    const start = pos;
    pos += 4;
    const body = skipPast("-->", "comment", start);
    if (body.includes("--") || body.endsWith("-")) fail("'--' is not allowed inside an XML comment", start);
  };
  const processingInstruction = () => {
    const start = pos;
    pos += 2;
    skipPast("?>", "processing instruction", start);
  };

  // Prolog: optional XML declaration, comments, processing instructions and one DOCTYPE.
  for (;;) {
    skipWs();
    if (pos >= src.length) return;
    if (startsWith("<?")) processingInstruction();
    else if (startsWith("<!--")) comment();
    else if (startsWith("<!DOCTYPE")) {
      const start = pos;
      const close = src.indexOf(">", pos);
      const bracket = src.indexOf("[", pos);
      pos = bracket !== -1 && bracket < close ? src.indexOf("]", bracket) : pos;
      if (pos === -1) fail("Unterminated DOCTYPE", start);
      pos = src.indexOf(">", pos);
      if (pos === -1) fail("Unterminated DOCTYPE", start);
      pos += 1;
    } else if (/^<!doctype/i.test(src.slice(pos, pos + 9))) {
      fail(
        `DOCTYPE must be uppercase: found ${src.slice(pos, src.indexOf(">", pos) + 1 || pos + 9)}`,
        pos,
        "XML is case-sensitive. Write <!DOCTYPE html>."
      );
    } else if (startsWith("<")) break;
    else fail(`Unexpected text before the root element: ${describe(src, pos)}`);
  }

  // Elements, through the end of </head>.
  while (pos < src.length) {
    if (startsWith("<!--")) {
      comment();
    } else if (startsWith("<![CDATA[")) {
      const start = pos;
      pos += 9;
      skipPast("]]>", "CDATA section", start);
    } else if (startsWith("<?")) {
      processingInstruction();
    } else if (startsWith("<!")) {
      fail(`Unexpected markup declaration ${describe(src, pos)}`);
    } else if (startsWith("</")) {
      const start = pos;
      pos += 2;
      const name = readName();
      skipWs();
      if (src[pos] !== ">") fail(`Malformed end tag </${name}`, start);
      pos += 1;
      const open = stack.pop();
      if (!open) fail(`End tag </${name}> has no matching start tag`, start);
      if (open.name !== name) {
        const voidHint = VOID_ELEMENTS.has(open.name.toLowerCase())
          ? `<${open.name}> is a void element; self-close it as <${open.name} ... />.`
          : undefined;
        fail(
          `Expected </${open.name}> (opened at line ${lineColumn(src, open.pos).line}) but found </${name}>`,
          start,
          voidHint ?? currentHint()
        );
      }
      if (name === "head") return;
      if (stack.length === 0) return;
    } else if (startsWith("<")) {
      if (!/[A-Za-z_:]/.test(src[pos + 1] ?? "")) fail("Bare '<' must be written as &lt;", pos, currentHint());
      const start = pos;
      pos += 1;
      const name = readName();
      const seen = new Set();
      for (;;) {
        const before = pos;
        skipWs();
        if (startsWith("/>")) {
          pos += 2;
          break;
        }
        if (src[pos] === ">") {
          pos += 1;
          stack.push({ name, pos: start });
          break;
        }
        if (pos >= src.length) fail(`Unterminated <${name}> tag`, start);
        if (pos === before) fail(`Attributes in <${name}> must be separated by whitespace`, pos);
        const attrStart = pos;
        const attr = readName();
        if (seen.has(attr)) fail(`Duplicate attribute "${attr}" in <${name}>`, attrStart);
        seen.add(attr);
        skipWs();
        if (src[pos] !== "=") {
          fail(`Attribute "${attr}" in <${name}> has no value`, attrStart, `XML has no boolean attributes. Write ${attr}="${attr}" or remove it.`);
        }
        pos += 1;
        skipWs();
        const quote = src[pos];
        if (quote !== '"' && quote !== "'") fail(`Value of attribute "${attr}" in <${name}> must be quoted`, pos);
        pos += 1;
        const valueStart = pos;
        const value = skipPast(quote, `value of attribute "${attr}"`, attrStart);
        const lt = value.indexOf("<");
        if (lt !== -1) fail(`'<' is not allowed in the value of attribute "${attr}"; write &lt;`, valueStart + lt);
        checkEntities(value, valueStart);
      }
    } else {
      const next = src.indexOf("<", pos);
      const end = next === -1 ? src.length : next;
      checkEntities(src.slice(pos, end), pos);
      pos = end;
    }
  }

  const open = stack.at(-1);
  if (open) fail(`<${open.name}> is never closed before </head>`, open.pos);
}

function lineColumn(src, pos) {
  const before = src.slice(0, pos);
  const line = before.split("\n").length;
  return { line, column: pos - before.lastIndexOf("\n") };
}

function describe(src, pos) {
  const snippet = src.slice(pos, pos + 20).split("\n")[0];
  return snippet ? JSON.stringify(snippet) : "end of file";
}
