# Polygonal Mind 100 Avatars R1 — source archive

- Source page: https://github.com/PolygonalMind/100Avatars/releases/tag/v22.12.1
- Downloaded source archive: `100Avatars_R1.zip` (121,129,480 bytes). The archive is retained locally for provenance and is intentionally not committed, keeping the PR limited to the selected runtime assets rather than a large source pack.
- License: CC0, as declared in the official Polygonal Mind release notes. The release says the avatars may be used for games and other projects. See the source page for the publisher's license statement.
- Contents: 100 avatar folders with FBX models, VRM models, and PNG textures. Only the curated runtime subset described below is committed.
- Duplicate check: the project already has Kenney blocky/mini characters and Quaternius zombie models; neither is this Polygonal Mind pack. No Polygonal Mind 100 Avatars source pack or matching filenames were present in the project's asset folders before download. Kenney, Quaternius, and KayKit entries from Cinevva were excluded because those packs are already in the project.
- Integration status: a curated subset of 22 human/cartoon VRM models is copied to `packages/client/public/assets/external/characters/polygonal-mind-100-avatars/` and registered in the character picker. Other avatars are not included in runtime.
- Runtime models are self-contained VRM files (GLB-based). The source PNGs are texture atlases rather than portrait thumbnails, so matching transparent 256×256 PNG thumbnails were rendered from all 22 runtime models for the picker and 3D preview.
- The included VRMs have no authored animation clips. GAMVerse applies a procedural humanoid pose and walk cycle to their Mixamo-compatible bones.
