#!/usr/bin/env node
/**
 * download-vegetation.mjs
 *
 * Fetches CC0 vegetation models and PBR ground textures from Poly Haven into
 * public/planner/vegetation/_raw/. Run `npm run optimize:vegetation` afterwards
 * to compress them into the final committed paths.
 *
 * Poly Haven public API: https://api.polyhaven.com (no auth required, CC0 license).
 * The model files we pull are GLBs at the LOD-2 resolution ("2k") which is the best
 * tradeoff between quality and bundle size for a planner-style scene.
 *
 * If you need to add or replace a model, edit MANIFEST below. The slug ("oak_tree")
 * is the Poly Haven asset slug — find it in the URL on https://polyhaven.com/a/<slug>.
 */

import { mkdirSync, createWriteStream, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const rawRoot = join(projectRoot, "public", "planner", "vegetation", "_raw");

/**
 * Manifest of CC0 assets to download. All slugs are from polyhaven.com/models or
 * polyhaven.com/textures. `kind` controls subfolder; `as` is the local file name
 * (without extension) so the optimize step writes a stable URL into public/.
 *
 * Resolution "2k" balances quality vs file size; bump to "4k" if you need
 * close-up hero trees.
 */
const MANIFEST = [
  // Trees -> public/planner/vegetation/trees/<as>.glb (CC0, Poly Haven)
  // We pick *lush, full-canopy* photoscans because the small / coastal scans
  // looked sparse and dry when scaled up to outdoor-tree size. Heavy raw
  // assets (jacaranda 234 MB, island_03 ~80 MB) compress to ~3-6 MB after
  // aggressive Meshopt + simplify in the optimize step. Conifers from Poly
  // Haven are 500 MB-1 GB raw and don't compress as well, so we keep just
  // a fir sapling for variety.
  { kind: "trees", category: "models", slug: "jacaranda_tree", as: "broadleaf-jacaranda", res: "2k" },
  { kind: "trees", category: "models", slug: "island_tree_01", as: "broadleaf-island-01", res: "2k" },
  { kind: "trees", category: "models", slug: "island_tree_02", as: "broadleaf-island-02", res: "2k" },
  { kind: "trees", category: "models", slug: "island_tree_03", as: "broadleaf-island-03", res: "2k" },
  { kind: "trees", category: "models", slug: "tree_small_02", as: "broadleaf-small", res: "2k" },
  { kind: "trees", category: "models", slug: "fir_sapling_medium", as: "conifer-fir-sapling", res: "2k" },

  // Bushes / shrubs -> public/planner/vegetation/bushes/<as>.glb
  { kind: "bushes", category: "models", slug: "shrub_01", as: "shrub-01", res: "2k" },
  { kind: "bushes", category: "models", slug: "shrub_02", as: "shrub-02", res: "2k" },
  { kind: "bushes", category: "models", slug: "shrub_03", as: "shrub-03", res: "2k" },
  { kind: "bushes", category: "models", slug: "wild_rooibos_bush", as: "rooibos-bush", res: "2k" },
  { kind: "bushes", category: "models", slug: "fern_02", as: "fern", res: "2k" },

  // Grass tufts -> public/planner/vegetation/grass/<as>.glb
  { kind: "grass", category: "models", slug: "grass_bermuda_01", as: "grass-bermuda", res: "2k" },
  { kind: "grass", category: "models", slug: "grass_medium_01", as: "grass-medium-01", res: "2k" },
  { kind: "grass", category: "models", slug: "grass_medium_02", as: "grass-medium-02", res: "2k" },

  // PBR ground texture maps -> public/planner/vegetation/ground/<as>_<map>.<ext>
  // Downloads JPGs at 2k; the optimize step converts to KTX2/WebP. We use
  // `leafy_grass` because `aerial_grass_rock` has dry/rocky patches that read
  // as "desert" in a planner scene.
  { kind: "ground", category: "textures", slug: "leafy_grass", as: "grass", res: "2k" },
];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "mebel-vegetation-fetcher/1.0" } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

async function downloadTo(url, dst) {
  const r = await fetch(url, { headers: { "User-Agent": "mebel-vegetation-fetcher/1.0" } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  mkdirSync(dirname(dst), { recursive: true });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dst));
}

function bytesHuman(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// Poly Haven model assets are distributed as a .gltf with a `textures/` folder
// of JPGs alongside it. We download everything into _raw/<kind>/<as>/ so the
// optimize step can pack the whole bundle into a single optimized .glb.
async function downloadModel(item) {
  const files = await fetchJson(`https://api.polyhaven.com/files/${item.slug}`);
  const tryRes = [item.res, "1k", "2k", "4k", "8k"].filter((v, i, a) => a.indexOf(v) === i);
  let bucket = null;
  let chosenRes = null;
  for (const r of tryRes) {
    const candidate = files?.gltf?.[r]?.gltf;
    if (candidate?.url) {
      bucket = candidate;
      chosenRes = r;
      break;
    }
  }
  if (!bucket) {
    throw new Error(
      `Asset "${item.slug}" has no gltf bucket (available: ${Object.keys(files?.gltf ?? {}).join(", ") || "none"})`
    );
  }

  const baseDir = join(rawRoot, item.kind, item.as);
  const mainName = bucket.url.split("/").pop();
  const mainDst = join(baseDir, mainName);
  if (existsSync(mainDst)) {
    console.log(`[download] skip ${item.kind}/${item.as}/ (already present)`);
    return;
  }

  console.log(`[download] ${item.slug}@${chosenRes} -> ${item.kind}/${item.as}/${mainName}`);
  await downloadTo(bucket.url, mainDst);
  console.log(`[download]   gltf ${bytesHuman(statSync(mainDst).size)}`);

  for (const [relPath, info] of Object.entries(bucket.include ?? {})) {
    if (!info?.url) continue;
    const dst = join(baseDir, relPath);
    if (existsSync(dst)) continue;
    await downloadTo(info.url, dst);
    console.log(`[download]   ${relPath} ${bytesHuman(statSync(dst).size)}`);
  }
}

async function downloadTexture(item) {
  const files = await fetchJson(`https://api.polyhaven.com/files/${item.slug}`);
  const wantedSlots = ["Diffuse", "nor_gl", "Rough", "AO", "Displacement"];
  const slotName = {
    Diffuse: "albedo",
    nor_gl: "normal",
    Rough: "roughness",
    AO: "ao",
    Displacement: "displacement",
  };

  for (const slot of wantedSlots) {
    const bucket = files?.[slot]?.[item.res];
    if (!bucket) continue;
    const jpg = bucket?.jpg ?? bucket?.png;
    if (!jpg?.url) continue;
    const ext = jpg.url.split(".").pop().toLowerCase();
    const dst = join(rawRoot, item.kind, `${item.as}_${slotName[slot]}.${ext}`);
    if (existsSync(dst)) {
      console.log(`[download] skip ${item.kind}/${item.as}_${slotName[slot]}.${ext} (already present)`);
      continue;
    }
    console.log(`[download] ${item.slug}:${slot} -> ${item.kind}/${item.as}_${slotName[slot]}.${ext}`);
    await downloadTo(jpg.url, dst);
    console.log(`[download]   ${bytesHuman(statSync(dst).size)}`);
  }
}

async function main() {
  console.log(`[download] target: ${rawRoot}`);
  for (const item of MANIFEST) {
    try {
      if (item.category === "models") await downloadModel(item);
      else if (item.category === "textures") await downloadTexture(item);
    } catch (err) {
      console.warn(`[download] FAILED ${item.slug}: ${err.message}`);
    }
  }
  console.log(`\n[download] Done. Run \`npm run optimize:vegetation\` next.`);
}

main();
