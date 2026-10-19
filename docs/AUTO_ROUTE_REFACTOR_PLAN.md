# Auto-route extraction

## Scope

One behavior-preserving phase: move the pure grid path search, priority queue,
route smoothing and segment collision checks from `OfficeRoom.ts` into a focused
server module, `offices/autoRoute.ts`. Keep room orchestration, authorization,
seat selection and movement simulation in their existing owners. The routing
module depends on shared geometry and never imports `OfficeRoom`.

Preserve the existing half-metre grid, nearest-cell search limit, neighbor order,
heap tie handling, office-sized iteration bound and collision sampling interval.
Name tunables with units and keep each function's cognitive complexity at most 15.

## Verification

- Run route contract tests against the original implementation before extraction.
- Cover direct routes, same-cell destinations, blocked destinations, disconnected
  areas, wall detours and diagonal collision checks through `findAutoRoute`.
- Run the same tests after extraction; deliberately break route behavior and
  confirm a contract test fails, then restore it.
- Register the adjacent test file in the server test command.
- Run `pnpm build`, workspace tests, server tests and `git diff --check`.
- Obtain independent review against the project rules. Record whether two-browser
  Compose verification was performed; automated geometry tests do not replace it.

## Verification results

- Seven route contracts passed against the original implementation and the
  extracted module. Disabling segment collision sampling caused three failures;
  restoring it returned all seven tests to green.
- Pinned pnpm 11.25.0 build passed all TypeScript checks and production bundles.
  Client output was directed to the external data volume. Vite still reports
  large bundle chunks.
- Shared tests: 50 passed; client tests: 129 passed; server tests: 94 passed.
  No failures or skipped tests. `git diff --check` passed.
- Two-browser Compose verification and an automated Sonar scan were not run.
  Independent code review checks complexity and dependency direction by inspection.
- Logs and client build output are under
  `/Volumes/ssd-fluke/BaseData/GAMVerse/refactor-20261015/`.

## Follow-up: seat approach extraction

Move pure seat selection and approach-point geometry from `OfficeRoom.ts` into
`offices/seatApproachRoute.ts`, using `autoRoute.ts` and shared seat geometry.
Keep occupancy state, room permissions and movement orchestration in the room.
Preserve zone-center containment, preferred-point ordering, anchor order,
legacy first-seat occupancy, rotation and approach-distance ordering.

Characterize the original helper before extraction. Cover occupied anchors,
zone filtering, preferred-seat selection, rotated approach geometry and no
available route. Register adjacent tests in the server command, prove a broken
occupancy or selection rule fails them, and rerun build and all package tests.
Obtain independent review. Starting the local Compose stack and checking its
entry page/API does not establish two-browser multiplayer verification.

### Follow-up verification results

- Nine seat contracts passed against the original helper and extracted module.
  Removing occupancy checks in an external mutant caused three failures; the
  actual implementation passed all nine tests. No mutant was loaded by the
  running dev server.
- Full build passed. Shared: 50 passed; client: 129 passed; server: 103 passed.
  No failures or skipped tests. Client output and verification logs use the
  external task directory with `seat-` prefixes.
- The local Compose stack is running. The configured dev address is
  `https://100.92.238.57:5173`; the page returns HTTP 200 and the API readiness
  endpoint returns `ready`. Safari signup displayed `Load failed` because the
  browser still rejected the local certificate at API port 2567. API preflight
  returns 204 with the expected origin and invalid registration returns 400.
  Browser certificate approval remains a user action; no signup behavior changed.
- Two-browser multiplayer checks and an automated Sonar scan remain unrun.
