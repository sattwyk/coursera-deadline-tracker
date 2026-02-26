#!/usr/bin/env bun

import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dir, "..");
const EXTENSION_DIR = join(ROOT, "extension-wxt");
const OUTPUT_DIR = join(EXTENSION_DIR, ".output");
const RELEASE_DIR = join(OUTPUT_DIR, "release");

const VERSION = process.env.VERSION || `v${new Date().toISOString().split("T")[0]}`;
const REPO = process.env.REPO || "sattwyk/coursera-deadline-tracker";
const EXTENSION_BASE_URL = process.env.EXTENSION_BASE_URL;

if (!EXTENSION_BASE_URL) {
  console.error("ERROR: EXTENSION_BASE_URL is required");
  console.error("Usage: EXTENSION_BASE_URL=https://your-worker.workers.dev bun run release");
  process.exit(1);
}

console.log("Building and zipping WXT extension for release...");
console.log(`  VERSION: ${VERSION}`);
console.log(`  REPO: ${REPO}`);
console.log(`  EXTENSION_BASE_URL: ${EXTENSION_BASE_URL}`);

const zipCmd =
  await $`cd ${EXTENSION_DIR} && WXT_WORKER_BASE_URL=${EXTENSION_BASE_URL} WXT_DEV_KNOBS=false bun run zip`;
if (zipCmd.exitCode !== 0) {
  console.error("WXT zip failed!");
  process.exit(1);
}

const outputFiles = await readdir(OUTPUT_DIR);
const chromeZip = outputFiles.find((file) => file.endsWith("-chrome.zip"));
if (!chromeZip) {
  console.error("Could not find generated Chrome zip in extension-wxt/.output");
  process.exit(1);
}

await rm(RELEASE_DIR, { recursive: true, force: true });
await mkdir(RELEASE_DIR, { recursive: true });

const zipName = `coursera-deadline-tracker-${VERSION}.zip`;
const sourceZipPath = join(OUTPUT_DIR, chromeZip);
const zipPath = join(RELEASE_DIR, zipName);
await copyFile(sourceZipPath, zipPath);

const zipStat = await stat(zipPath);
console.log(`Zip ready: ${zipName} (${(zipStat.size / 1024 / 1024).toFixed(2)} MB)`);

console.log("\nCreating GitHub release draft...");

const releaseBody = `## Download

1. Download the zip file below
2. Unzip it
3. Open Chrome and go to \`chrome://extensions/\`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the unzipped folder

## Built With

- WXT + React + Tailwind + 8bit-style UI
- Worker base URL set at build time via \`EXTENSION_BASE_URL\`
`;

const release =
  await $`gh release create ${VERSION} ${zipPath} --title "Coursera Deadline Tracker ${VERSION}" --notes "${releaseBody}" --repo ${REPO} --draft`;

if (release.exitCode !== 0) {
  console.error("Failed to create release!");
  process.exit(1);
}

console.log(`\nRelease created: https://github.com/${REPO}/releases/tag/${VERSION}`);
console.log("   (It's a draft - edit and publish from the GitHub UI)");
