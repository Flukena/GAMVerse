# Modify props catalog and thumbnails

## Goal

Separate placeable objects from modular building components, move finished building prefabs into the map editing workflow, and make every catalog item use a matching static thumbnail file. Catalog cards must not render a model at runtime just to create a thumbnail.

## Phases

1. **Catalog and editor separation** — Define explicit catalog roles for ordinary objects, modular building components, and finished building prefabs. Keep the prop editor focused on objects/components, expose finished buildings from Edit Map, and keep saved props and map geometry on their existing versioned persistence paths. The app remains playable throughout.
2. **Static thumbnail assets** — Audit all catalog entries and model paths; generate a per-asset thumbnail file for entries without a correct individual preview, and use the same static image URL pattern as character portraits. Remove the runtime WebGL thumbnail renderer after the catalog is fully covered.
3. **Verification** — Build the app; audit that each catalog item has a matching thumbnail and each selectable model resolves; check the map editor and prop catalog in the browser.

## Current audit

- `ROOM_PROP_CATALOG` contains 1,502 entries.
- The catalog now assigns 1,336 items to Objects, 144 to Building components, and 22 finished prefabs to Map Editor.
- All 1,502 selectable model/geometry paths resolve in the local asset tree, including the separately loaded vehicle models.
- All 1,502 catalog entries now resolve to a thumbnail file. The 680 item-specific previews are reused; 822 PNGs were generated for missing previews and the 34 entries that only had pack-wide sheets.
- The generated set contains 796 GLTF and 26 OBJ model previews at 128 × 88. Every file has a valid PNG signature.
- Prop catalog cards now load static `<img>` files; there is no runtime WebGL thumbnail renderer.
- Existing map editing persists map geometry and office props separately; the new UI must preserve that versioned boundary.

The finished-building picker is available from Edit Map. Its placement, move, rotate, and remove actions update the map draft, and Save map continues to use the separate versioned props endpoint for prop changes.

## Decisions

- Use explicit classification based on catalog metadata and model identity, not UI text matching alone.
- Do not remove building assets from shared catalog or rendering; only move finished building prefabs from the prop editor into the map-edit workflow.
- Keep ordinary modular wall/floor/roof/structure pieces available in a dedicated building-components section.
- Reuse per-character portrait behavior: catalog items reference static PNG files and render as `<img>` elements.
