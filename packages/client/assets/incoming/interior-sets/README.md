# Incoming interior asset review

This is an isolated staging area for review only. Nothing here is registered in the runtime prop catalog or loaded by the app.

## Downloaded candidate packs

### Pixel Modern Office — 3DAssets.dev
- Source: https://3dassets.dev/packs/pixel-modern-office
- Terms declared by source: CC0 1.0 Universal; no attribution required; source permits modification and redistribution, including commercial use.
- Files: 91 individual GLB models, grouped into `props/`, `walls/`, and `tiles/`. Textures are embedded; source scale is metres, +Y up.
- Candidate content: desk/chairs, storage, monitors, plants and decor; plain/window/door wall bays and glass partitions; carpet, wood, ceramic and ceiling tiles.
- Collision: source says collider/navigation data is not supplied. `asset-index.json` records mesh bounds and a suggested AABB per model; those are only starting points and need visual/gameplay review.
- Source-manifest.json preserves source per-model metadata and license information.

### Cozy Home Interiors — 3DAssets.dev
- Source: https://3dassets.dev/packs/cozy-home-interiors
- Terms declared by source: CC0 1.0 Universal; no attribution required; source permits modification and redistribution, including commercial use.
- Files: 129 individual GLB models, grouped into `props/`, `walls/`, and `tiles/`. Textures are embedded; source scale is metres, +Y up.
- Candidate content: domestic furniture and decor; modular wall sections, corners and door pieces; floor and ceiling tiles.
- Collision: source says collider/navigation data is not supplied. `asset-index.json` records mesh bounds and a suggested AABB per model; those are only starting points and need visual/gameplay review.
- `source-manifest.json` preserves source per-model metadata and license information.

## Reviewed, not downloaded

### Quaternius Furniture Pack
- Source: https://quaternius.com/packs/furniture.html
- Terms: source declares CC0 and says free for personal and commercial projects.
- Formats: FBX, OBJ, Blend. Candidate category: props (beds, chairs, tables); no wall/tile models are indicated on this pack page.
- Download link opens a public Google Drive folder. The pack's individual file list/metadata was not reliably available in this review, so no files were copied. Source page itself is available for manual review/download.
- Collision: no collision metadata found on the pack page.

### Low-poly Cozy Bedroom Set — Pretty Planets
- Source: https://pretty-planets.itch.io/low-poly-cozy-bedroom-set
- Terms: itch page explicitly declares CC0 1.0 Universal, no attribution required. It is a name-your-own-price pack with a $0 option.
- Formats: BLEND and FBX. Candidate category: props (desk, chair, nightstand, bed frame, bed, pillows); no wall/tile assets are listed.
- The official itch $0 download route was rate-limited during retrieval, so no files were copied.
- Collision: no collision metadata listed.

### Office Pack - Free — Unity Asset Store
- Source: https://marketplace.unity.com/packages/3d/props/interior/office-pack-free-258600
- Price: free. License is the Standard Unity Asset Store EULA; listing identifies it as an Extension Asset.
- Excluded from staging: Unity Asset Store assets are not a clear license for copying and redistributing the raw pack inside this repository. Use through the Asset Store under its EULA if the project owner later chooses to adopt it.
- Listing advertises an office low-poly/PBR pack; downloadable file formats and candidate item inventory require the Unity account/Asset Store download flow.

## Note on collision

No pack in this review supplied authored gameplay collision meshes/data. For downloaded 3DAssets models, the index exposes bounds-based AABBs as review aids. They are not implemented physics colliders and have not been tuned for walkability, seats, doors, or interactions.
