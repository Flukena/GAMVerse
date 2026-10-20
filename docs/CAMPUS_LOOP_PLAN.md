# Campus Loop template

## Scope

One playable phase updates the shared campus generator used by new-office templates. Existing saved maps and separately versioned props are not migrated. Reuse installed furniture/nature assets and add code-authored park water/path/bridge surfaces, with matching shared collision and client rendering. Authorization, persistence contracts and media remain unchanged.

## Implementation

- Replace disconnected/dead-end slab construction with an outer driving loop, cross streets and team alleys connected at both ends.
- Align private-room columns and road geometry for every supported team size; reserve full road footprints outside rooms.
- Fit five equal-width meeting rooms along each map edge, filling the strip between inner avenue and perimeter road; add flower beds in the gaps between rooms. Furnish each team meeting room with twenty chairs, conference tables, a presentation area, paired lounge corners, a refreshment nook, plants, shelves and tabletop decor. Keep roadside trees/lights/bins and finished-building infill. Preserve deterministic seeds and keep props off driving surfaces.
- Refine team meeting furnishing in one phase: two carpeted conference islands with twenty chairs, paired inward-facing lounge areas, a far-wall presentation axis and a grouped refreshment/library wall. Target roughly 30% catalog ground coverage including carpet, preserving the central entrance aisle; measure coverage rather than count scattered props.
- Document template access and verify connectivity, road endpoints, room/prop clearance, catalog validity and deterministic generation.
- Civic park refinement: keep the central buildings and street connections, furnish civic meeting rooms for 50 people, Town Hall for 200, and Lobby with reception desks and waiting lounges. Lay out a rich-green outdoor lawn, paired pond sections around traversable timber crossings, connected pale paths, orderly tree canopies and grouped waterfront benches/lights/bins. Reserve this strip from generic building and random landscaping infill. Indoor room floors stay opaque and neutral.

- City block refinement: preserve the requested team count and separate every adjacent team block with a planted finished-building plaza. Five-team inputs retain exactly five groups. Use existing catalog buildings and a regular perimeter tree border with walking gaps; grow the compact band width to reserve genuine city spaces. Preserve civic rooms, road connectivity and saved-office behavior.

## Verification

Show regression tests failing before implementation and passing afterward. Run shared/server suites and production build; report existing baseline failures separately. A two-session Compose driving check remains required when the live stack is available.
