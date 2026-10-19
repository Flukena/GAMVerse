# Exterior props in Building Components

## Goal

Place large exterior environment pieces from the map editor's **Building components** section. Move street furniture, factory kit pieces, rocks, and trees out of the office-prop placement catalog while keeping existing map and office-prop persistence paths separate.

## Phase 1 — Catalog classification and map editor

- Classify street/factory/industrial props, outdoor nature and park props, rocks and trees as map components using catalog metadata and stable asset/group identity.
- Add a dedicated **Transporter** picker for the driveable vehicle catalog and place vehicles through the existing map-layout draft flow.
- Keep transporters separate from static Building components while preserving their existing driveable vehicle behavior.
- Keep indoor building pieces in the office prop editor and finished buildings in the Finished buildings picker.
- Keep already saved placements intact; this change affects future catalog selection and does not migrate persisted office props into map layouts.
- Verify with the full TypeScript/production build and a browser check of map placement, save, and reload.
