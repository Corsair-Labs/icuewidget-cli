import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_APP_VERSION,
  DEFAULT_DEVICE_TYPE,
  DEFAULT_FRAMEWORK_VERSION,
  DEFAULT_PLATFORM,
} from "./constants.js";
import {
  cssTemplate,
  iconTemplate,
  indexTemplate,
  jsTemplate,
  translationTemplate,
} from "./templates.js";
import { writeJson } from "./fs-utils.js";

export async function scaffoldWidget(targetDir, answers) {
  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all([
    fs.mkdir(path.join(targetDir, "resources"), { recursive: true }),
    fs.mkdir(path.join(targetDir, "scripts"), { recursive: true }),
    fs.mkdir(path.join(targetDir, "styles"), { recursive: true }),
  ]);

  const manifest = {
    author: answers.author,
    id: answers.widgetId,
    name: answers.widgetName,
    description: answers.description,
    version: answers.version,
    preview_icon: answers.previewIcon,
    min_app_version: answers.minAppVersion ?? DEFAULT_APP_VERSION,
    min_framework_version: DEFAULT_FRAMEWORK_VERSION,
    os: [{ platform: DEFAULT_PLATFORM }],
    supported_devices: [{ type: DEFAULT_DEVICE_TYPE }],
  };

  await writeJson(path.join(targetDir, "manifest.json"), manifest);
  await writeJson(path.join(targetDir, "translation.json"), translationTemplate(answers.widgetName));
  await fs.writeFile(path.join(targetDir, "index.html"), indexTemplate(answers.widgetName), "utf8");
  await fs.writeFile(path.join(targetDir, "styles", "main.css"), cssTemplate, "utf8");
  await fs.writeFile(path.join(targetDir, "scripts", "main.js"), jsTemplate, "utf8");
  await fs.writeFile(path.join(targetDir, "resources", "icon.svg"), iconTemplate(answers.widgetName), "utf8");

  return manifest;
}
