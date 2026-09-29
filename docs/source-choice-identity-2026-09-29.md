# Source-owned choice identity — September 29, 2026

The user's request permits choices with the same local ID/name from different sources. Henshin Hero's `element` choice and Elemental Blaster's `element` choice are distinct because their source records differ. Display names were already nonunique; the repaired global restriction applied to authored `choiceId` values.

## Identity and references

`scripts/game-data/choice-bindings.mjs` supplies the common source-v5 index to validation and artifact construction. A stable source uses entity type, owning class/origin where relevant, and feature/feat/Trait/Technique identity. Sheet row numbers, display names and catalogue order do not identify choices. A source may declare a local ID once; another source may reuse it.

Bare references search the exact source, nearest ancestor, owning class/origin (including class-category Feats), and finally the historical globally-unambiguous fallback. Each tier must resolve once. An ambiguous reference is a blocking finding rather than first-match selection. Explicit references such as `class-feature:weapon-master:left:element` can disambiguate. Recipient references still require a Bond in the same owning class/origin, and option counts still target a real group with enough children. V4 validation/export remains compatible.

New v5 artifacts use exporter `3.1.0-source-owned-choices`, runtime schema 3 and `choiceIdentityVersion: 1`. Explicit Weapon/Technique answer IDs and their `choiceRef` consumers are qualified during compilation, so existing widgets, Rules, graph and sheet receive the same exact binding. Long internal identities use a deterministic hash of the full source/key rather than truncating a shared prefix, leaving space for count suffixes and generated-weapon IDs. Runtime aliases retain the complete old ID and owner. Source values/raw expressions stay unchanged, and prerequisite labels use the authored local ID.

Trait, Bond and Keystone Rules already compose source/slot identities; those existing saved bindings are preserved. Deferred element/recipient subsystems stay deferred. Selecting the same Trait multiple times requires instance-specific answer ownership and option validation; accepting duplicate IDs from different source records does not implement that separate mechanic.

## Saved characters

The complete artifact records exact `{ from, to, sourceId }` aliases. CharacterMigrations uses them after historical shape conversion and on current-schema reads. It renames an old answer only when its map key, answer ID and recorded owner agree. Multiple candidates, mismatched owners and occupied destination keys fail closed. The migration never guesses an owner, overwrites an answer, grants a new entity or writes Firebase during loading.

Generated weapon IDs and payloads remain stable while their choice references are rebound through the proven saved answer. Explicit saves continue through the existing codec/revision-aware writer. A subsequent load produces no repeated content conversion. Schema 4, 5 and 6 fixtures cover the same mapping; old catalogues without the marker retain their prior behavior.

## Verification and release state

Preflight: **632 units** and the production baseline. Final workspace: **642 units, 21 emulator rule tests, 15 HTML asset checks**. Published-data integration: **3 tests**. An isolated staged export excluding unrelated edits passes **634 units, 14 tracked HTML asset checks and the ten-artifact baseline**; its first run caught missing formatter-context plumbing in the selectively staged file, which was corrected before the passing run. Ten new controlled tests cover cross-source duplicates, same-source rejection, scoped/ancestor/qualified references, ambiguous/missing references, recipient restrictions, same-key groups, nested alternatives, bounded multi-slot IDs, nonmutation/order stability, exact saved ownership, generated-weapon preservation, conflicting answers, schema 4/5/6 conversion and reload, graph ownership, and retaining a sheet Technique after only one provider is removed.

No browser acceptance of new production data is claimed: the complete real-source candidate remains blocked. Revalidating the already verified September 28 native snapshot as `20260929T175754427Z-9984` reports **2 errors / 111 warnings**. `duplicate-choice-id` is gone; Schema row 117 and Traits J1 still identify the unsupported `repeatable` field. No artifacts were emitted and no source/data/Hosting changes were made. This keeps the user's release condition intact.

Evidence: `.staging/choice-source-preflight.log`, `.staging/choice-source-focused.log`, `.staging/choice-source-full.log`, `.staging/choice-source-isolated.log`, `.staging/choice-source-stage.log` and the immutable staging run. Unrelated workspace edits are preserved. Next is repeatable Trait integration within `WPE-DOMAIN-MIGRATION`, then a fresh full export, saved-character impact review and release verification. `WPF-UI-SYSTEM` subsequently consolidates shared controls, accessibility and navigation after remaining domain acceptance.
