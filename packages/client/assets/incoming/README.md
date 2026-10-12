# Third-party asset intake

Source packs are kept under `office-sets/`, `interior-sets/`, and `park-sets/`. The directories preserve the source URL, license terms, and any included notices. Runtime-ready CC0 models from Pixel Modern Office, Cozy Home Interiors, and City Park and Playground are copied to `packages/client/public/assets/external/`; their searchable catalog entries are generated into `packages/shared/src/externalRoomProps.ts` by `packages/client/scripts/prepare-external-room-assets.mjs`.

## Runtime integration

- **Props:** all 3DAssets models classified as props have collision enabled for substantial objects. Their rectangular ground blockers use the measured model bounds, and smaller decorative items remain pass-through.
- **Walls:** imported wall/boundary modules are available as wall appearance choices. The room wall segment itself supplies movement collision.
- **Tiles:** imported floor and ceiling tiles appear in the `Floor tiles` prop group and do not block movement.
- AABB bounds are approximations; these packs do not provide authored gameplay colliders. Seat locations and thin/irregular objects still need scene review.
- The 3DAssets packs state that their models were AI-generated. This is disclosed here so maintainers can decide whether that provenance fits the project.

## Exclusions and limits

- **DigitalSin Low Poly Office Essentials:** not downloaded; the listing did not declare a license.
- **Unity Office Pack Free:** not copied; its Asset Store license does not clearly permit redistributing the raw pack in this repository.
- **Mini Toon Modular Office:** not downloaded because the free checkout required personal contact details.
- **VNB Office Set:** downloaded to the local intake area under CC BY 4.0. The author prohibits reselling models individually or as a pack, so it is not copied to runtime or registered in the catalog pending an explicit redistribution review. Keep its attribution with the source files.
- **Quaternius Furniture** and **Pretty Planets Cozy Bedroom:** CC0, but the downloads were unavailable during intake (public Drive inventory could not be retrieved; itch.io rate limited the free checkout).
- **Tiny Treats Fun Playground:** CC0, but the official download was rate limited. Its separate paid Blender source was not downloaded.
- **MrEliptik Office Pack:** CC0, downloaded and categorized in intake. It is not in the current runtime catalog because no measured collision index was generated for it yet.

See each pack's README for detailed classification and provenance.
