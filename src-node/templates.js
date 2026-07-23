export function translationTemplate(widgetName) {
  return {
    widget_name: widgetName,
    Layout: "Layout",
    "Widget Personalization": "Widget Personalization",
    Headline: "Headline",
    Subtitle: "Subtitle",
    "Show Subtitle": "Show Subtitle",
    "Text Color": "Text Color",
    "Accent Color": "Accent Color",
    Background: "Background",
    Transparency: "Transparency",
    "Hello World": "Hello World",
  };
}

export function indexTemplate(widgetName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(widgetName)}</title>
  <link rel="icon" href="resources/icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="styles/main.css" />
  <meta name="x-icue-property" content="headline" data-label="tr('Headline')" data-type="textfield" data-default="'Hello World'" />
  <meta name="x-icue-property" content="showSubtitle" data-label="tr('Show Subtitle')" data-type="switch" data-default="true" />
  <meta name="x-icue-property" content="subtitle" data-label="tr('Subtitle')" data-type="textfield" data-default="'Built with iCUE Widget CLI'" />
  <meta name="x-icue-property" content="textColor" data-label="tr('Text Color')" data-type="color" data-default="'#ffffff'" />
  <meta name="x-icue-property" content="accentColor" data-label="tr('Accent Color')" data-type="color" data-default="'#59c2ff'" />
  <meta name="x-icue-property" content="backgroundColor" data-label="tr('Background')" data-type="color" data-default="'#111827'" />
  <meta name="x-icue-property" content="transparency" data-label="tr('Transparency')" data-type="slider" data-default="20" data-min="0" data-max="100" data-step="1" data-unit-label="'%'" />
</head>
<body>
  <main id="content">
    <div id="accent"></div>
    <h1 id="headline">Hello World</h1>
    <p id="subtitle">Built with iCUE Widget CLI</p>
  </main>
  <script src="scripts/main.js"></script>
  <script>
    icueEvents = {
      onICUEInitialized: function(payload) { applySettings(payload && payload.settings); },
      onDataUpdated: function(payload) { applySettings(payload && payload.settings); },
    };

    if (iCUE_initialized) {
      applySettings();
    }
  </script>
</body>
</html>
`;
}

export const cssTemplate = `:root {
  --text-color: #ffffff;
  --accent-color: #59c2ff;
  --background-color: #111827;
  --transparency: 20%;
}

html,
body {
  height: 100%;
  margin: 0;
}

body {
  display: grid;
  place-items: center;
  background: transparent;
  font-family: Inter, Segoe UI, system-ui, sans-serif;
}

#content {
  min-width: 60%;
  padding: 24px 28px;
  border-radius: 24px;
  color: var(--text-color);
  background: color-mix(in srgb, var(--background-color) calc(100% - var(--transparency)), transparent);
  text-align: center;
}

#headline {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
}

#accent {
  width: 56px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: var(--accent-color);
}

#subtitle {
  margin: 10px 0 0;
  font-size: 18px;
  opacity: 0.8;
}
`;

export const jsTemplate = `const state = {
  headline: "Hello World",
  subtitle: "Built with iCUE Widget CLI",
  showSubtitle: true,
  textColor: "#ffffff",
  accentColor: "#59c2ff",
  backgroundColor: "#111827",
  transparency: 20,
};

function applySettings(settings = {}) {
  Object.assign(state, settings);
  document.documentElement.style.setProperty("--text-color", state.textColor);
  document.documentElement.style.setProperty("--accent-color", state.accentColor);
  document.documentElement.style.setProperty("--background-color", state.backgroundColor);
  document.documentElement.style.setProperty("--transparency", state.transparency + "%");
  document.getElementById("headline").textContent = state.headline;
  const subtitle = document.getElementById("subtitle");
  subtitle.textContent = state.subtitle;
  subtitle.hidden = !state.showSubtitle;
}

applySettings();
`;

export function iconTemplate(widgetName) {
  const title = escapeHtml(widgetName);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#59c2ff"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="#111827"/>
  <path d="M29 84h70M34 64h60M43 44h42" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>
</svg>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
