# City Park and Playground

- Source: https://3dassets.dev/packs/city-park-and-playground
- Creator/publisher: 3DAssets.dev; the pack page states all 41 files were AI-generated with Claude Opus 5 and prepared for human review.
- License: CC0 1.0 Universal; commercial use, modification and redistribution allowed, no attribution required. Official license code is preserved in `LICENSE-CC0-1.0.txt`.
- Formats: 41 individual `.glb` files downloaded from the publisher's CDN; includes 40 individual models plus the assembled starter-scene GLB. Y-up, metres. Pack manifest and `asset-index.json` preserve source URLs and metadata.
- Collision: publisher explicitly says the pack contains no collision/navigation data. `asset-index.json` carries candidate AABB dimensions derived from publisher-reported model size (metres), not collision meshes; verify actual bounds/origin on import and tune gameplay margins. No runtime collision was implemented in this incoming-only import.

## Candidate classification

- **Props (30 individual):** swings, slide, climbing frame, monkey bars, seesaw, spring rockers, roundabout, sandpit, play tower, rope net, rules sign, bench, picnic table, litter bin, drinking fountain, lamp post, notice board, bike rack, bollards, dog-waste bin, flower bed, trees, shrub, bandstand, pergola, kiosk, park gate.
- **Walls / boundaries (4):** playground fence panel, fence gate bay, clipped hedge section, park gate with brick piers.
- **Tiles / ground (6):** red/blue rubber safety surfaces, straight/quarter-turn park path tiles, lawn tile, duck-pond edge piece.
- **Starter scene (1):** assembled Riverside Park and Playground; kept separate from standalone candidate models.

See `asset-index.json` for exact per-file category, dimensions, triangle count, animation names, and source link. Collision AABBs there are provisional bounds only, not author-supplied colliders.
