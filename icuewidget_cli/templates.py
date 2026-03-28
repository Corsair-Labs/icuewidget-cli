from __future__ import annotations

import json

from .constants import (
    DEFAULT_ACCENT_COLOR,
    DEFAULT_BG_COLOR,
    DEFAULT_TEXT_COLOR,
    DEFAULT_TRANSPARENCY,
)


def escape_single_quotes(value: str) -> str:
    return value.replace("'", "\\'")


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def build_translation_json(widget_name: str) -> str:
    payload = {
        widget_name: widget_name,
        "Layout": "Layout",
        "Widget Personalization": "Widget Personalization",
        "Headline": "Headline",
        "Subtitle": "Subtitle",
        "Show Subtitle": "Show Subtitle",
        "Text Color": "Text Color",
        "Accent Color": "Accent Color",
        "Background": "Background",
        "Transparency": "Transparency",
        "Hello World": "Hello World",
    }
    return json.dumps(payload, indent=2) + "\n"


def build_index_html(widget_name: str) -> str:
    safe_name = escape_xml(widget_name)
    js_name = escape_single_quotes(widget_name)
    title = f"tr('{js_name}')"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="resources/icon.svg">
  <link rel="stylesheet" href="styles/main.css">
  <meta name="x-icue-property" content="headline"
        data-label="tr('Headline')"
        data-type="textfield"
        data-default="tr('{js_name}')">

  <meta name="x-icue-property" content="showSubtitle"
        data-label="tr('Show Subtitle')"
        data-type="switch"
        data-default="true">

  <meta name="x-icue-property" content="subtitle"
        data-label="tr('Subtitle')"
        data-type="textfield"
        data-default="tr('Hello World')">

  <meta name="x-icue-property" content="textColor"
        data-label="tr('Text Color')"
        data-type="color"
        data-default="'{DEFAULT_TEXT_COLOR}'">

  <meta name="x-icue-property" content="accentColor"
        data-label="tr('Accent Color')"
        data-type="color"
        data-default="'{DEFAULT_ACCENT_COLOR}'">

  <meta name="x-icue-property" content="backgroundColor"
        data-label="tr('Background')"
        data-type="color"
        data-default="'{DEFAULT_BG_COLOR}'">

  <meta name="x-icue-property" content="transparency"
        data-label="tr('Transparency')"
        data-type="slider"
        data-default="{DEFAULT_TRANSPARENCY}"
        data-min="0"
        data-max="100"
        data-step="1">

  <script type="application/json" id="x-icue-groups">
  [
    {{"title": "tr('Layout')", "properties": ["headline", "showSubtitle", "subtitle"]}},
    {{"title": "tr('Widget Personalization')", "properties": ["textColor", "accentColor", "backgroundColor", "transparency"]}}
  ]
  </script>
</head>
<body>
  <div id="content">
    <div id="accent"></div>
    <div id="headline">{safe_name}</div>
    <div id="subtitle">Hello World</div>
  </div>

  <script>
    icueEvents = {{
      "onICUEInitialized": init,
      "onDataUpdated": update
    }};

    function init() {{
      update();
    }}

    function update() {{
      const currentHeadline = typeof headline !== 'undefined' ? headline : '{js_name}';
      const currentSubtitle = typeof subtitle !== 'undefined' ? subtitle : 'Hello World';
      const currentShowSubtitle = typeof showSubtitle !== 'undefined' ? showSubtitle : true;
      const currentTextColor = typeof textColor !== 'undefined' ? textColor : '{DEFAULT_TEXT_COLOR}';
      const currentAccentColor = typeof accentColor !== 'undefined' ? accentColor : '{DEFAULT_ACCENT_COLOR}';
      const currentBackgroundColor = typeof backgroundColor !== 'undefined' ? backgroundColor : '{DEFAULT_BG_COLOR}';
      const currentTransparency = typeof transparency !== 'undefined' ? transparency : {DEFAULT_TRANSPARENCY};

      document.documentElement.style.setProperty('--text-color', currentTextColor);
      document.documentElement.style.setProperty('--accent-color', currentAccentColor);
      document.documentElement.style.setProperty('--bg-color', currentBackgroundColor);
      document.documentElement.style.setProperty('--bg-opacity', String(currentTransparency / 100));

      document.getElementById('headline').textContent = currentHeadline;
      document.getElementById('subtitle').textContent = currentSubtitle;
      document.getElementById('subtitle').style.display = currentShowSubtitle ? 'block' : 'none';
    }}

    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) {{
      init();
    }}
  </script>
</body>
</html>
"""


def build_starter_stylesheet() -> str:
    return f""":root {{
  color-scheme: dark;
  --text-color: {DEFAULT_TEXT_COLOR};
  --accent-color: {DEFAULT_ACCENT_COLOR};
  --bg-color: {DEFAULT_BG_COLOR};
  --bg-opacity: 1;
}}

html, body {{
  margin: 0;
  width: 100%;
  height: 100%;
  font-family: Arial, sans-serif;
}}

body {{
  display: grid;
  place-items: center;
  background: transparent;
}}

#content {{
  min-width: 60%;
  padding: 24px 28px;
  border-radius: 24px;
  color: var(--text-color);
  background: color-mix(in srgb, var(--bg-color) calc(var(--bg-opacity) * 100%), transparent);
  font-size: 32px;
  text-align: center;
  box-sizing: border-box;
}}

#headline {{
  font-weight: 700;
  margin-bottom: 10px;
}}

#accent {{
  width: 56px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: var(--accent-color);
}}

#subtitle {{
  opacity: 0.8;
  font-size: 18px;
}}
"""


def build_default_icon_svg(widget_name: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect x="8" y="8" width="112" height="112" rx="24" stroke="#FFFFFF" stroke-width="10"/>
  <path d="M34 36h14l16 45 16-45h14L82 94H68L34 36Z" fill="#FFFFFF"/>
  <title>{escape_xml(widget_name)} icon</title>
</svg>
"""
