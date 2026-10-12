# Cozy Home Interiors

Source: https://3dassets.dev/packs/cozy-home-interiors
Manifest: https://3dassets.dev/api/v1/packs/cozy-home-interiors
License: CC0 1.0 Universal (per source pack manifest; attribution not required). See source-manifest.json for per-asset license and URLs.
Format: individual GLB files with embedded texture; source states metres and +Y up.

## Groups

- props/: furniture and decorative objects
- walls/: wall bays, partitions, wall modules, doors and corner/trim pieces
- 	iles/: floor/ceiling tiles and floor surfaces

## Collision review

The source explicitly leaves colliders/navigation to the consuming game. sset-index.json records source mesh bounding-box dimensions and a suggested axis-aligned box for each model. These are candidate collision bounds, not authored collision meshes; validate them against the rendered asset and seating/interaction needs before runtime use.

The models are staged as candidates only. They have not been added to the runtime asset catalog.
