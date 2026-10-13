# Park assets — incoming review

Source packs and license notices are kept here. City Park and Playground models are also runtime/catalog integrations; the other park pack is staged for later review.

| Pack | License / status | Files |
| --- | --- | --- |
| Tiny Treats Pretty Park | CC0 1.0; downloaded and extracted | `pretty-park/` |
| Tiny Treats Fun Playground | CC0 1.0; official zero-price download was blocked by HTTP 429 in this run; no asset archive included | `fun-playground/README.md` |
| City Park and Playground | CC0 1.0; all available GLBs downloaded and integrated | `city-park-and-playground/` |
| Kenney Nature Kit | CC0 1.0; integrated (329 GLB props) | `kenney-nature-kit/` |
| Riclmbr Low Poly Trees Pack | CC0 1.0; integrated (26 OBJ props and shared texture atlases) | `riclmbr-low-poly-trees/` |
| KayKit Forest Nature Pack | CC0 1.0; free tier integrated (105 glTF props; paid tiers excluded) | `kaykit-forest-nature/` |
| Quaternius Stylized Nature MegaKit | CC0 1.0; standard tier integrated (68 glTF props) | `quaternius-stylized-nature-megakit/` |

The CC0 legal code is included as `CC0-1.0-legalcode.txt`; individual pack directories also preserve a copy or the publisher-provided license file. City Park props use approximate AABB blockers derived from publisher-reported model dimensions; tiles do not block, and walls use room-segment collision. These are not authored colliders. The four nature packs add 528 entries to `ROOM_PROP_CATALOG`, with approximate model-bounds footprints and collision blockers for floor props. Runtime files and per-pack license notices are copied to `packages/client/public/assets/external/nature/` by running `node packages/client/scripts/prepare-nature-assets.mjs`.
