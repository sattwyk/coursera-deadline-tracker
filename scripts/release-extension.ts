#!/usr/bin/env bun

import { rm, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dir, "..");
const EXTENSION_DIST = join(ROOT, "extension/dist");
const RELEASE_DIR = join(EXTENSION_DIST, "release");

const VERSION = process.env.VERSION || `v${new Date().toISOString().split("T")[0]}`;
const REPO = process.env.REPO || "sattwyk/coursera-deadline-tracker";
const EXTENSION_BASE_URL = process.env.EXTENSION_BASE_URL;

if (!EXTENSION_BASE_URL) {
  console.error("ERROR: EXTENSION_BASE_URL is required");
  console.error("Usage: EXTENSION_BASE_URL=https://your-worker.workers.dev bun run release");
  process.exit(1);
}

console.log(`Building extension for release...`);
console.log(`  VERSION: ${VERSION}`);
console.log(`  REPO: ${REPO}`);
console.log(`  EXTENSION_BASE_URL: ${EXTENSION_BASE_URL}`);

const build =
  await $`cd ${join(ROOT, "extension")} && EXTENSION_BASE_URL=${EXTENSION_BASE_URL} bun run build:prod`;

if (build.exitCode !== 0) {
  console.error("Build failed!");
  process.exit(1);
}

console.log(`Creating release zip...`);

await rm(RELEASE_DIR, { recursive: true, force: true });
await mkdir(RELEASE_DIR, { recursive: true });

const zipName = `coursera-deadline-tracker-${VERSION}.zip`;
const zipPath = join(RELEASE_DIR, zipName);

await $`cd ${EXTENSION_DIST} && zip -r ${zipPath} .`;

const zipStat = await stat(zipPath);
console.log(`Zip created: ${zipName} (${(zipStat.size / 1024 / 1024).toFixed(2)} MB)`);

console.log(`\nCreating GitHub release...`);

const releaseBody = `## Download

1. Download the zip file below
2. Unzip it
3. Open Chrome and go to \`chrome://extensions/\`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the unzipped folder

## Configure

Update \`manifest.json\` with your worker URL if needed:
\`\`\`json
"host_permissions": [
  "https://YOUR-WORKER-URL.workers.dev/*"
]
\`\`\`

Or rebuild with: \`EXTENSION_BASE_URL=https://your-worker.workers.dev bun run build:prod\`
`;

const release =
  await $`gh release create ${VERSION} ${zipPath} --title "Coursera Deadline Tracker ${VERSION}" --notes "${releaseBody}" --repo ${REPO} --draft`;

if (release.exitCode !== 0) {
  console.error("Failed to create release!");
  process.exit(1);
}

console.log(`\nRelease created: https://github.com/${REPO}/releases/tag/${VERSION}`);
console.log(`   (It's a draft - edit and publish from the GitHub UI)`);
