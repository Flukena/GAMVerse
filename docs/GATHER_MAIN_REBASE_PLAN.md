# Visible Gather delivery and main rebase

The owner requested finishing the current visible deliverable before rebasing onto main. Stop after the desk manager and furnished/empty office creation; personal desk decoration and the remaining parity roadmap stay out of this delivery.

## Acceptance before rebase

- Keep the completed dock, 2D, workspace, people, availability, desk claim/return, device settings, conversation, privacy, meeting, screen-share and raised-hand flows playable.
- Finish canonical desk Assign/Move/Unassign with role checks, conflict handling, truthful recovery and revocation of old-owner access.
- Offer Furnished/Empty only for newly created offices, using the existing licensed catalog. Preserve saved offices and separate map/prop versions.
- Run the build, registered client/shared tests, isolated server tests, independent review and browser checks. Record the existing failing URL expectation separately.

## Preserve and align history

Fetched `origin/main` is `34c2041b79eb671a2a0da6baac590af33af81a8e`. At inspection, the feature branch HEAD `98f4923317dfa5adeadbc433d8869fb6674db1b3` is already its ancestor: main has 34 additional commits and the feature branch has no unique committed changes. Refresh this check before changing history.

1. Wait for all writers to stop. Pause the local development watcher before moving source files; keep the isolated, frozen QA stack available.
2. Save a backup ref, tracked source patch, untracked source inventory and restoration evidence in the external task directory. Preserve generated/private `.devmode.json` separately without adding its contents to Git history or printing them.
3. Retain a named stash of source changes until post-rebase verification completes. Rebase the feature branch onto the fetched main, then apply the preserved work without dropping the stash.
4. Resolve source conflicts by combining the current feature contracts with upstream account, avatar/pet, rendering, movement-budget and media fixes. The owner explicitly permits replacing upstream UI where the new workspace UI is better; use the new layout as the presentation baseline while retaining upstream functionality and security fixes. Preserve both package test registrations. Do not choose one side wholesale for the large coordinators.
5. Keep unrelated pre-existing work and the private generated state intact. No production deployment, environment change or source asset pack addition is part of this task.

## Forward-only migration compatibility

Both histories used integer ledger versions 23 and 24 for different migrations:

| History | 23 | 24 |
| --- | --- | --- |
| Main | Polygonal Mind avatar presets | KayKit avatar presets |
| Feature development DB | Office availability | Canonical office desks |

The ledger stores only version and applied time. The feature migrations have already run on the configured development database. Preserve all four historical SQL files byte-for-byte, and never rewrite existing ledger rows. Main's 23/24 registrations remain canonical after rebase.

Subject to the final fetched main still ending at 24, add forward migrations:

- **25:** Create availability storage only if it is absent. Existing profiles, expiry and `updated_at` remain intact.
- **26:** Create canonical desk storage, constraints and legacy owner backfill only when the canonical table is absent. Existing desk UUIDs, claims, retired rows and recreated zones must never be backfilled again. Retain duplicate-owner and nonmember-owner preflight for a genuine legacy import.
- **27:** Reconcile the approved character constraint to the main-24 superset so the feature-development history also gains the missing avatar presets. Check the actual earlier constraints and custom-avatar representation before implementing the superset; retain existing valid identities.

These are new migrations. No applied SQL file is edited, deleted or renumbered, and no application/user data is removed. Historical feature SQL files remain as immutable provenance even though fresh installs use the new forward registrations.

## Migration proof before restarting the watcher

Use separate RAM-only PostgreSQL fixtures and the actual registered migration path:

1. Fresh history through 22.
2. Main through 24, with both newer avatar families represented.
3. Feature through 24, with custom availability/expiry and canonical claimed, retired and recreated desk identities.

Each must converge to the same usable schema, preserve its fixture data, support the approved avatar IDs and custom-avatar path, and run initialization twice without a second mutation. Check rollback for invalid legacy desk ownership. Run these probes without inheriting the configured development database connection.

## Post-rebase gate

- Independent review of conflict resolutions and forward migration behavior.
- Full build and registered suites, separating any unchanged baseline failure from regressions.
- Frozen QA browser checks of the integrated 2D/dock, furnished creation, desk management and representative privacy/meeting flows; preserve upstream account/media behavior.
- Restore private generated state and resume the local watcher only after source and migration compatibility are verified. Report the actual target main SHA, visible features, checks and any remaining limitation.

## Execution evidence

Pre-rebase build passed; client320/320 and isolated server220/220 passed. Shared78/79 retained the existing propInteraction URL expectation failure. Browser checks created both Furnished and Empty offices through the native form and exercised Assign, Move and Unassign against the real API/realtime path; all three mutations returned persisted/applied. The desk manager fit a390px viewport without horizontal overflow.

The development watcher was paused before preservation. A private external backup, source patch, untracked-file inventory and backup ref were created. `feat/gather-2d` rebased successfully onto refreshed `origin/main` at `34c2041b79eb671a2a0da6baac590af33af81a8e`; the named source stash remains retained while its source conflicts are combined. New forward migrations25–27 are registered after the immutable main23/24 entries. Post-rebase gates and actual migration-history probes remain required before resuming the watcher.

Migration gate passed using the actual registered initializer against six RAM-only PostgreSQL databases. Fresh22, main24 and feature24 converge to the same schema, accept all59 approved presets and preserve the custom-avatar foreign key. Each initializes twice without mutating existing data or ledger rows. Feature claims, UUIDs, retired/recreated desks, availability text/expiry and timestamps remain unchanged. Duplicate, nonmember and missing legacy owner fixtures reject the upgrade and roll back its whole transaction. Three negative controls using external SQL copies fail for the intended reason when availability idempotence, the existing-desk guard or character reconciliation is removed. Applied source SQL was never edited. Evidence: external `migration-matrix-registered-2.log` and `migration-matrix-mutant-*-red-2.log`.

Post-rebase verification is complete: build passed, client332/332 and isolated server251/251 passed, shared79/80 retained the same existing URL expectation failure, and independent merged review cleared. Two browser profiles connected against the rebased production bundles; desk manager members, camera-off meeting roster, dock-to-remote raised-hand queue, Grid/Active speaker, ReturntoOffice and private device settings passed. The local watcher was resumed and the app container restarted: Vite5173 responds200, API2568 and realtime2567 respond404 at their root paths, and a read-only ledger query confirms23–27 applied. No unmerged paths or whitespace errors remain. All264 originally untracked source files remain present; original private cache and its regenerated runtime successor are backed up externally, private files are unstaged, and the source stash remains retained. No commit, push or production deployment has been performed.
