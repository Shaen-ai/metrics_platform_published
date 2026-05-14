# Outdoor planner vegetation assets

This folder holds the GLB models and PBR ground textures used by the outdoor
planner's photoreal scene (see `src/app/planner/scene/OutdoorSpaceMesh.tsx` and
`src/app/planner/scene/outdoorTreeGlb.tsx`).

## Layout

```
public/planner/vegetation/
  trees/<variant>.glb        # broadleaf-* and conifer-* tree variants
  bushes/<variant>.glb       # shrubs, ferns, hedges
  grass/<variant>.glb        # grass tufts that scatter near the camera
  ground/grass_<map>.webp    # PBR ground texture set (albedo, normal, roughness, ao, displacement)
  _raw/                      # gitignored: original Poly Haven downloads (multi-file .gltf bundles)
```

Only the optimized files committed under `trees/`, `bushes/`, `grass/`, and
`ground/` are shipped to the client. The raw downloads under `_raw/` can be
hundreds of MB each and are listed in `.gitignore`.

## Adding or replacing assets

1. Edit the `MANIFEST` array in `scripts/download-vegetation.mjs` with the
   Poly Haven slug, target subfolder, and stable file name.
2. `npm run download:vegetation` — fetches CC0 source GLTFs and PBR maps into
   `public/planner/vegetation/_raw/`.
3. `npm run optimize:vegetation` — runs `@gltf-transform/cli optimize` on every
   bundle (Meshopt geometry compression + texture compression + simplify) and
   writes a single `.glb` per asset into the committed folders.

### KTX2 (optional, recommended for production)

The optimize script automatically uses **KTX2** texture compression if the
`toktx` binary from
[KhronosGroup/KTX-Software](https://github.com/KhronosGroup/KTX-Software) is on
your `PATH`. Without it, the script falls back to **WebP**, which is smaller
than JPG/PNG and supported by `THREE.TextureLoader` natively.

Pass `--no-ktx2` to force WebP even when `toktx` is available.

### Tweaking quality vs size

`scripts/optimize-vegetation.mjs` defaults to `--simplify-error 0.005`, which
trims most photoscanned meshes by ~95% without breaking small shrubs. Pass
`--fast` to use the more aggressive `0.02` (smaller files, may collapse fine
detail).

## License

All committed assets are CC0 from [Poly Haven](https://polyhaven.com). No
attribution is required for use, but the originals are credited in
[CREDITS.md](./CREDITS.md) for goodwill and to make audits trivial.
