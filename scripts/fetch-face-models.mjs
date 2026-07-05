// One-time fetch of the face-recognition model weights into public/models.
//   node scripts/fetch-face-models.mjs      (or: npm run fetch-face-models)
// ~7 MB total. Weights are NOT committed to git — they're an external asset, like the
// collector worker. Until they're present, the FACES button degrades gracefully.
//
// Override the source with FACE_MODEL_CDN if your environment blocks jsDelivr.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.FACE_MODEL_CDN || "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const OUT = "public/models";
const MODELS = ["tiny_face_detector", "face_landmark_68", "face_recognition"];

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

await mkdir(OUT, { recursive: true });
let files = 0;
for (const model of MODELS) {
  const manifestName = `${model}_model-weights_manifest.json`;
  const manifest = await (await get(`${BASE}/${manifestName}`)).json();
  await writeFile(join(OUT, manifestName), JSON.stringify(manifest));
  files++;
  const paths = new Set();
  for (const group of manifest) for (const p of group.paths || []) paths.add(p);
  for (const p of paths) {
    const buf = Buffer.from(await (await get(`${BASE}/${p}`)).arrayBuffer());
    await writeFile(join(OUT, p), buf);
    files++;
    process.stdout.write(`  ✓ ${p} (${(buf.length / 1024).toFixed(0)} KB)\n`);
  }
}
console.log(`\nDone — ${files} files in ${OUT}/. The FACES button is now live.`);
