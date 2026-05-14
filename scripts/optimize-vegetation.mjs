#!/usr/bin/env node
/**
 * optimize-vegetation.mjs
 *
 * Walks public/planner/vegetation/_raw/**\/*.glb and produces optimized GLBs
 * under public/planner/vegetation/<same-relative-path>/. Uses @gltf-transform/cli
 * to apply Meshopt vertex compression, KTX2 (UASTC + ETC1S) texture compression,
 * dedup, and prune.
 *
 * Requirements:
 *   - npm install (installs @gltf-transform/cli devDependency)
 *   - For KTX2: the `toktx` binary from KhronosGroup/KTX-Software must be on PATH.
 *     If toktx is not present, the script falls back to WebP texture compression
 *     (smaller than PNG, no native binary required).
 *
 * Usage:
 *   npm run optimize:vegetation
 *   npm run optimize:vegetation -- --no-ktx2     # force webp texture path
 *   npm run optimize:vegetation -- --quality fast
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const rawRoot = join(projectRoot, "public", "planner", "vegetation", "_raw");
const outRoot = join(projectRoot, "public", "planner", "vegetation");

const args = new Set(process.argv.slice(2));
const forceWebp = args.has("--no-ktx2");
const fast = args.has("--fast") || args.has("--quality") && process.argv.includes("fast");

function hasToktx() {
  try {
    execSync("toktx --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Discover model bundles to optimize. Each result is a single source path
 * (.gltf or .glb) and the destination .glb path under outRoot.
 *
 * Layout under rawRoot:
 *   _raw/<kind>/<asset>/<asset>_2k.gltf  +  textures/...     (Poly Haven gltf bundle)
 *   _raw/<kind>/<asset>.glb                                    (single-file glb)
 */
function discoverBundles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const kind of readdirSync(dir)) {
    const kindDir = join(dir, kind);
    if (!statSync(kindDir).isDirectory()) continue;
    if (kind === "ground") continue; // ground textures are processed separately

    for (const entry of readdirSync(kindDir)) {
      const full = join(kindDir, entry);
      const st = statSync(full);
      if (st.isFile() && entry.toLowerCase().endsWith(".glb")) {
        out.push({ src: full, dst: join(outRoot, kind, entry) });
        continue;
      }
      if (st.isDirectory()) {
        // find the .gltf file inside this asset folder
        const gltfFile = readdirSync(full).find((f) => f.toLowerCase().endsWith(".gltf"));
        if (gltfFile) {
          out.push({ src: join(full, gltfFile), dst: join(outRoot, kind, `${entry}.glb`) });
        }
      }
    }
  }
  return out;
}

function bytesHuman(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function runGltfTransform(args) {
  // Use npx so we use the locally installed @gltf-transform/cli devDependency.
  execFileSync("npx", ["--no-install", "@gltf-transform/cli", ...args], {
    stdio: "inherit",
    cwd: projectRoot,
  });
}

function dirSize(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (st.isFile()) return st.size;
  let total = 0;
  for (const e of readdirSync(p)) total += dirSize(join(p, e));
  return total;
}

function optimizeOne(bundle) {
  const { src, dst } = bundle;
  const relSrc = relative(rawRoot, src);
  const relDst = relative(outRoot, dst);
  mkdirSync(dirname(dst), { recursive: true });

  const useKtx2 = !forceWebp && hasToktx();
  const textureCompress = useKtx2 ? "ktx2" : "webp";

  const cliArgs = [
    "optimize",
    src,
    dst,
    "--texture-compress", textureCompress,
    "--simplify", "true",
    // Vegetation is silhouette-driven; 0.005 cuts heavy meshes ~95% without
    // collapsing small shrubs (which break at 0.01+).
    "--simplify-error", fast ? "0.02" : "0.005",
    "--compress", "meshopt",
    "--prune", "true",
    "--instance", "true",
    "--join", "true",
  ];

  console.log(`\n[optimize] ${relSrc} -> ${relDst}  (${textureCompress})`);
  // For .gltf bundles, count the whole source folder; for .glb count just the file.
  const srcDir = dirname(src);
  const beforeSize = src.toLowerCase().endsWith(".gltf") ? dirSize(srcDir) : statSync(src).size;
  runGltfTransform(cliArgs);
  const afterSize = existsSync(dst) ? statSync(dst).size : 0;
  console.log(
    `[optimize] ${relSrc}  ${bytesHuman(beforeSize)} -> ${bytesHuman(afterSize)} (${
      afterSize > 0 ? Math.round((1 - afterSize / beforeSize) * 100) : 0
    }% smaller)`
  );
}

/**
 * Compress raw ground PBR JPGs (downloaded under _raw/ground/) into a sibling
 * outRoot/ground/ folder using WebP (lossy, ~80%) — small enough for the web
 * and supported by THREE.TextureLoader without an extra decoder.
 */
async function processGround() {
  const groundIn = join(rawRoot, "ground");
  const groundOut = join(outRoot, "ground");
  if (!existsSync(groundIn)) return;
  mkdirSync(groundOut, { recursive: true });

  let { default: sharp } = { default: null };
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    console.log(
      "[optimize] `sharp` not installed; copying ground textures as JPG. " +
        "Run `npm i -D sharp` and re-run for WebP compression."
    );
  }

  const { copyFileSync } = await import("node:fs");
  for (const entry of readdirSync(groundIn)) {
    if (!/\.(jpe?g|png)$/i.test(entry)) continue;
    const srcPath = join(groundIn, entry);
    const baseName = entry.replace(/\.(jpe?g|png)$/i, "");
    if (sharp) {
      const dst = join(groundOut, `${baseName}.webp`);
      console.log(`[optimize][ground] ${entry} -> ${baseName}.webp`);
      const before = statSync(srcPath).size;
      await sharp(srcPath).webp({ quality: 82 }).toFile(dst);
      const after = statSync(dst).size;
      console.log(
        `[optimize][ground]   ${bytesHuman(before)} -> ${bytesHuman(after)} (${Math.round((1 - after / before) * 100)}% smaller)`
      );
    } else {
      const dst = join(groundOut, entry);
      copyFileSync(srcPath, dst);
      console.log(`[optimize][ground] copied ${entry}`);
    }
  }
}

async function main() {
  if (!existsSync(rawRoot)) {
    console.error(
      `[optimize] No raw assets found.\n` +
        `[optimize] Place .glb files under: ${rawRoot}\n` +
        `[optimize] Tip: run \`npm run download:vegetation\` to fetch CC0 trees/bushes from Poly Haven.`
    );
    process.exit(1);
  }

  const bundles = discoverBundles(rawRoot);

  if (forceWebp) {
    console.log("[optimize] --no-ktx2 set: using WebP texture compression.");
  } else if (!hasToktx()) {
    console.log(
      "[optimize] toktx not found on PATH: falling back to WebP. Install KTX-Software (https://github.com/KhronosGroup/KTX-Software) for KTX2."
    );
  } else {
    console.log("[optimize] toktx detected: using KTX2 (UASTC + ETC1S) textures.");
  }

  for (const b of bundles) optimizeOne(b);
  await processGround();
  console.log(`\n[optimize] Done. Optimized ${bundles.length} model(s) and ground textures under ${outRoot}.`);
}

main();
