#!/usr/bin/env node
/**
 * Downloads the MediaPipe runtime + FaceLandmarker model into public/mediapipe
 * so Aureline can run fully offline with zero third-party requests at runtime.
 *
 *   node scripts/fetch-mediapipe.mjs
 *
 * Aureline also works without this step: lib/mediapipe.ts falls back to the
 * official CDN when the bundled assets are missing.
 */

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const VERSION = "0.10.14";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "mediapipe");

const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const FILES = [
  { url: `${WASM_BASE}/vision_wasm_internal.js`, out: join(OUT, "wasm", "vision_wasm_internal.js") },
  { url: `${WASM_BASE}/vision_wasm_internal.wasm`, out: join(OUT, "wasm", "vision_wasm_internal.wasm") },
  { url: `${WASM_BASE}/vision_wasm_nosimd_internal.js`, out: join(OUT, "wasm", "vision_wasm_nosimd_internal.js") },
  { url: `${WASM_BASE}/vision_wasm_nosimd_internal.wasm`, out: join(OUT, "wasm", "vision_wasm_nosimd_internal.wasm") },
  { url: MODEL_URL, out: join(OUT, "face_landmarker.task") },
];

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 1024;
  } catch {
    return false;
  }
}

async function download({ url, out }) {
  if (await exists(out)) {
    console.log(`  ✓ already present  ${out.replace(ROOT + "/", "")}`);
    return;
  }
  await mkdir(dirname(out), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText} — ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(out));
  const { size } = await stat(out);
  console.log(`  ↓ ${(size / 1024 / 1024).toFixed(2)} MB  ${out.replace(ROOT + "/", "")}`);
}

console.log(`\nAureline · fetching MediaPipe ${VERSION}\n`);
try {
  for (const file of FILES) await download(file);
  console.log("\nDone. public/mediapipe is ready — Aureline will use it instead of the CDN.\n");
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  console.error(
    "The app still works — lib/mediapipe.ts falls back to the official CDN at runtime.\n"
  );
  process.exitCode = 1;
}
