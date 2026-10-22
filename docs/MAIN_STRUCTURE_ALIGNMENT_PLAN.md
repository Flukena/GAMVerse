# Main structure alignment

## Scope and contract

Align the client, server and shared packages with `AGENTS.md` after fast-forwarding
`feat/gather-2d` to `origin/main` at `55d3c8a`. Keep gameplay, persisted layouts,
wire schemas, media authorization and public package exports compatible. Preserve
the existing private `.devmode.json` change.

## Work and ownership

- Client: extract the duplicated 2D locate-request transition from `WorldCanvas`
  into a focused, independently testable world module. Extract self-contained UI
  helpers/components from `OfficeApp` into their appropriate UI owners, keeping
  world independent of UI.
- Server: make `PlayerSpatialInterest` own distant-marker projection cadence;
  `OfficeRoom` coordinates it at the existing point in the simulation tick.
- Shared: separate room-layout contracts and prop catalog from the layout
  coordinator. Point catalog/type consumers at the lower modules to remove
  dependencies back into their owner. Keep existing public exports compatible.
- Verification: record the current main test baseline, run registered package
  tests and `pnpm build`, and obtain an independent rule-conformance review.

## Acceptance

- The affected god-files shrink; extracted modules own their state/contracts and
  use one-way dependencies. Client and server continue to share common rules.
- New tests sit beside their modules and run through package test scripts.
  Existing tests cover preserved behavior; focused tests cover locate-request
  deduplication and marker deadlines. Any behavior fix needs a failing control.
- Type checks and production bundles pass. Any unchanged test failure is reported
  separately with before/after evidence.
- No production/configuration, migration, secret or asset-pack changes. Bulk
  verification output stays under
  `/Volumes/ssd-fluke/BaseData/GAMVerse/main-structure-20261022/`.
- Multiplayer browser checks are required if behavior changes; pure structural
  changes still report explicitly whether two-session checks were run.

## Initial verification — 22 October 2026

The initial refactor was checked in an external verification workspace using the
unchanged lockfile, pnpm 11.25.0 and Node 26.5.0. All 38 changed package source,
test, script and manifest files match that workspace byte for byte. The private
runtime state was excluded from the overlay. `pnpm build` passed before and after.

| Registered suite | Main baseline | After refactor |
| --- | --- | --- |
| Shared | 99 passed, 3 failed | 99 passed, 3 failed |
| Client | 431 passed, 9 failed | 439 passed, 9 failed |
| Server | 335 passed, 9 failed, 1 existing skip | 340 passed, 9 failed, 1 existing skip |

The same 21 test names fail in both runs; no new failures or skips were added.
Client locate/presentation tests add eight passing cases, and server marker/tick
tests add five. Negative controls failed when missing-player requests were retried
or the simulation tick stopped delegating marker projection; restored sources pass.
These are structural extractions rather than fixes for the baseline failures.

All 1,508 normalized catalog entries, their ordering, and wall/door identifiers
have the same serialized SHA-256 as main. Catalog normalization now lives in
`roomPropCatalogPolicy.ts`, with focused classification, scale, placement and seat
helpers. `roomLayout.ts` shrank from 1,044 to 168 lines.

A static local import audit, including type-only edges and the shared package
entry, found two cyclic components on main and none after the refactor across
384 production TypeScript/TSX modules. Tests, CSS and external packages were excluded.
Both asset-generator syntax checks and `git diff --check` passed. Independent
review found no new issues; this was a source review, not a SonarQube scan.

No browser or two-session multiplayer checks were run; there is no intended
gameplay, media, authorization or persistence behavior change. No commit, push or
production deployment was performed. Logs, mutation controls, catalog fingerprints
and `verification-summary.json` remain in the external task directory above.

## Continuation scope

The owner requested continuing the implementation. Extend the same structural
alignment by separating the remaining unrelated responsibilities in shared
`index.ts` into focused lower modules, preserving its public barrel exports and
schema identities. Extract self-contained UI controls/helpers from `OfficeApp`
into their corresponding UI owners. Retain the completed server and room-layout
work. Keep existing behavior and the recorded baseline failures unchanged, then
repeat the build, registered suites and independent review for the final source.

## Continuation results — 22 October 2026

`index.ts` shrank from 598 to 51 lines and now only exports the public API.
Asset identifiers, world contracts/defaults/builders, wire schemas, camera,
blocker grids, collision, movement and entrance checks have focused owners.
Complex grid/entrance logic was split into small functions, and saved-prop blocker
conversion is shared by its callers. Public export names, kinds and constant
values match the initial refactor. Default schemas, tagged/public encoded wire
fixtures and decoded state match byte for byte.

UI icons, touch input, panel presence and activity formatting moved out of
`OfficeApp`, reducing it by another 120 lines, or 174 lines total versus main.
Four new activity-formatting tests pass; removing UUID suppression causes the
corresponding test to fail, and the restored source passes.

| Registered suite | Final result |
| --- | --- |
| Shared | 99 passed, 3 unchanged failures |
| Client | 443 passed, 9 unchanged failures |
| Server | 340 passed, 9 unchanged failures, 1 existing skip |

Build passed. All 21 failing test names and the existing skip match main, with
17 additional passing tests across both rounds. All 54 changed package files
match the tested external workspace byte for byte. The production import audit
now covers 398 modules and 1,017 runtime/type edges with no cycles. Independent
source review found no new issues. README and current architecture ownership
notes were updated; no new browser checks, commit, push or deployment were made.
Continuation logs, parity fixtures and `continuation-verification-summary.json`
are in the same external task directory.
