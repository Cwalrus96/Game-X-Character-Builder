# Live character save investigation — September 21, 2026

The reported remote Class-page failure occurs before Firestore receives a save. The deployed controller calls `getGameXFeats` from `computeVisibleFeats`, reached through `buildAutoAbilities` during save, but omits that function from its imports. A browser replay of the deployed files against an emulator copy of the reported character produces `ReferenceError: getGameXFeats is not defined` and the visible message `Could not save.`

An import-only browser experiment reaches `Saved.`, but its database comparison exposes two further defects: the old feat filter reads `classKey` rather than the published feat category, dropping the selected feat's derived ability text; and replacing the entire sanitized skill-field map drops sheet-owned values such as current HP. That experiment is not a release candidate. The bounded repair must use the existing compatible feat lookup and preserve sheet-owned leaves while updating Class-owned state.

The current local controller has already been replaced by the session/graph implementation, so publishing the entire local website would include much more than this repair. A separately verified copy of the deployed Hosting release is required for the narrow hotfix.

The completed candidate uses `getGameXFeatsForClass` and the shared required-level helper. It sanitizes the existing patch, then writes individual skill fields and the three owned ability/skill lists. Sheet-owned counters, notes, conditions, and unknown play-state leaves are absent from the write; explicit skill/list removals still apply. Browser save/reload succeeds while retaining the selected feat and its ability, schema v4, and newer HP, strain, notes, and conditions written to the emulator after the Class page loaded.

## Migration findings and repair

Authorized read-only production inspection captured 14 documents at `2026-09-21T18:41:59.804Z`: 13 schema-v4 documents under the per-user character path and one unversioned document at the older single-character path. The private snapshot SHA-256 is `d86bbe9a452430ae9feaae230dd5fda6a4b166e42cb5ebcc348e424702c077d6`. Snapshots, player identifiers, and private prose remain ignored under `.staging/firestore-character-audit/`; tracked tests contain synthetic examples only. No production character was written.

The original migrator accepted four of the 13 current-path records. The extended registry recognizes historical core-skill field IDs, reviewed named skill grants, old composite feat-option IDs, stale merged selection aliases, nested timestamp metadata, and missing automatic class-feature owners when the reviewed class/level relationship proves a unique owner. Unknown references and conflicting or ambiguous owners still fail. Explicit modern selections, including empty selections, take precedence over obsolete merged aliases.

The shared grant projection also resolves migrated stable option keys against published schema-2 artifacts. Without this compatibility, migration preserved an option but later calculations lost its granted combat skill. Legacy composite labels remain supported only when unambiguous.

All 13 captured current-path records pass migration, codec validation, and an explicit save/reload rehearsal under authenticated emulator rules. Reads do not write; the first explicit save writes schema v5 and increments the revision; reloading does not reapply migration. Complete canonical character state and original creation times survive, and stale writes are rejected without changing stored state. The old single-character path is outside this repair.

## Separate runtime release findings

Format migration and game-rule reconciliation are distinct. Reconciliation evaluates whether choices still satisfy the current game rules; it must not silently rewrite the stored examples used to test format conversion.

Two captured records retain equipment capacity/rank conflicts after grant projection is corrected. Seven records produce confirmation-required impacts. These are additional acceptance cases, not permission to invent training or discard player equipment and choices.

The reported character opens in the current local builder, but its Save preview proposes removing an existing Spirit Warrior feat. That preview was cancelled. The migrated key is correct and the feat's prerequisites pass. The old Class page supplies a feat slot using its level formula; the published schema-2 Spirit Warrior features contain no explicit feat grant, which the new graph now requires. The staged schema-3 candidate supplies the level-2 class grant and correctly assigns this same feat to it. Thus the broader builder rollout needs coordinated game-data release acceptance, beyond format migration.

## Release boundary

The read-only Hosting audit verified all 102 published paths from version `ff9730b38f571322`, including Firebase's reserved initialization responses. The final candidate changes only `/js/builder/builder-class.js`; the other 101 hashes, nine reviewed data artifacts, and production serving configuration are identical. Candidate controller SHA-256: `732c8f456b6574eec5bcecb7ab1ec27f668187cae26272bd82e1a957c83bb283`. The ignored API release plan reuses the 101 existing hashes, guards against a changed live version, and uploads only the changed controller after approval. No version creation, upload, finalization, or release has been performed.

Reproduce the candidate with `scripts/prepare-class-save-hotfix.mjs`, passing the captured deployed controller as `--source` and a separate ignored staging controller as `--output`. The script requires the original file's verified hash and has no network/deployment action. Synthetic regressions verify its source guard, compatible feat lookup, and preservation of newer play state; an ignored replay additionally exercises the captured production modules. Final checks pass 361 unit tests, 17 emulator rule tests, 14 HTML asset checks, the nine-artifact baseline, and whitespace checks. Local Firebase was restarted preserving its data; the isolated hotfix browser runs at `http://127.0.0.1:5012`.

The bounded deployed Class-page repair and the local v5 migration implementation are separate release scopes. The Class hotfix leaves character schema, game-data artifacts, Firebase Rules, and the newer builder implementation unchanged. Production Hosting still requires the explicit narrow override described in `AGENTS.md` while the broader signed-in acceptance gate remains pending.

The next application step remains `WPE-DOMAIN-MIGRATION`: verify actual signed-in editing, save/reload, cancellation, conflicts, and focus behavior against compatible reviewed data before switching the complete builder. `WPB-V5-RELEASE-REVIEW` separately addresses removed identities, schema-3 publishing support, and exact candidate approval. Neither step requires completing unfinished game content.

## Release follow-up — September 21, 22:27 UTC

The user subsequently said, "I'll perform manual acceptance soon, but not now. That should not be a blocker." This removes their personal acceptance as a blocker and supplies the override for the already reviewed Class-only Hosting hotfix. It does not approve new game-data publication, a full builder deployment, Rules/Functions changes, or production character writes.

The verified candidate was released at `2026-09-21T22:27:06.868Z` as Hosting version `d5c9671adee0ab31`. The API reused 101 original file hashes and uploaded only the changed Class controller. Post-release inspection verifies all 102 manifest paths, the original serving configuration, the public controller's exact SHA-256, and all nine public data files against their frozen hashes. No production character was written. The previous version `ff9730b38f571322` is retained as the rollback target; ignored `hosting-hotfix-deployment.json` records the completed release.

Predeployment verification reran 361 unit tests, the nine-artifact baseline, and 14 asset checks. The earlier full suite's 17 emulator tests and browser preservation checks apply to these unchanged candidate bytes. Broader engineering continues without waiting for personal manual testing; the known runtime/data incompatibilities remain concrete work to resolve.
