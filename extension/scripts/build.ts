import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTDIR = join(ROOT, "dist");
const ENTRYPOINTS = [join(ROOT, "popup.html"), join(ROOT, "background.ts")];
const STATIC_FILES = ["manifest.json"];
const mode = process.env.EXTENSION_BUILD === "prod" ? "prod" : "dev";
const isProd = mode === "prod";
const workerBaseUrl = (
  process.env.EXTENSION_BASE_URL || (isProd ? "" : "http://127.0.0.1:8787")
).trim();

if (isProd && !workerBaseUrl) {
  console.error(
    "EXTENSION_BASE_URL is required for prod build. Example: EXTENSION_BASE_URL=https://your-worker.workers.dev bun run build:prod",
  );
  process.exit(1);
}

await rm(OUTDIR, { recursive: true, force: true });

const build = await Bun.build({
  entrypoints: ENTRYPOINTS,
  outdir: OUTDIR,
  target: "browser",
  format: "esm",
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  sourcemap: isProd ? "none" : "linked",
  minify: isProd,
  define: {
    __WORKER_BASE_URL__: JSON.stringify(workerBaseUrl || "http://127.0.0.1:8787"),
    __DEV_KNOBS__: isProd ? "false" : "true",
  },
});

if (!build.success) {
  for (const log of build.logs) {
    console.error(log);
  }
  process.exit(1);
}

for (const file of STATIC_FILES) {
  const src = Bun.file(join(ROOT, file));
  await Bun.write(join(OUTDIR, file), src);
}

console.log(
  `Built extension bundle (${build.outputs.length} outputs) to ${OUTDIR}/ [mode=${mode}, dev_knobs=${!isProd}]`,
);
