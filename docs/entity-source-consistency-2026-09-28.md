# Entity behavior across acquisition sources — September 28, 2026

The missing Dazzling Wand Technique exposed a wider problem: the sheet, ordinary Technique picker, source-choice picker and prerequisites assembled different lists of what a character knew. The earlier sheet-only repair is now replaced by shared Rules used throughout the active builder and sheet paths.

## Invariant and implementation

A Technique is the same entity regardless of where it was acquired. The same rule applies to Feats, Traits, Skills, Weapons and Keystones. Source records describe ownership, explicitly authored rank/skill context and whether the acquisition consumes a normal slot. They do not define separate rendering, rolling or prerequisite behavior. This is now an explicit repository invariant in `AGENTS.md` and the architecture contract.

- One stable-key Technique ownership projection combines normal learning, direct grants, source-owned choices and Trait/weapon links. It retains multiple providers while displaying one card. Builder, sheet, prerequisites and graph use the same result; rolls retain the common performance and damage Rules.
- Source traversal shares ancestor prerequisites/readiness, level and reachable Feat allocation. Orphaned Feats cannot keep granting entities or authorize themselves. Nested Feat choices and grants on Class option groups retain their real source through reconciliation.
- Technique choices share skill/tag/key filters and rank checks in the picker, graph and ownership projection. A granted route cannot bypass a skill-filtered choice's rank requirement. An unanswered feature choice never creates extra ordinary Technique capacity.
- Technique prerequisite evidence connects to actual grant-answer/automatic nodes. Losing the final provider reviews dependent removals, Cancel leaves accepted state unchanged, and Apply/save use the exact reviewed state. Another valid provider preserves the entity and dependents.
- Trait/weapon UI projections include Techniques acquired from all sources, so a granted Technique can unlock a Trait consistently. Grant-only cycles cannot authorize themselves.
- Keystone display combines Origin, Background, Bond and valid feature-owned text through the same formatter. Feature-owned entries require an active matching owner and show the current catalogue label. Bond cards retain their contextual Keystone text as well.
- Skill grants already share one rank projection. A discovered overwrite bug is repaired: a weaker Defense grant no longer replaces a stronger grant due to traversal order.

No character schema change, saved-state migration, source-data edit or generated-data edit is required. Ownership remains in existing fields; read models never write character data. Unsupported Familiar/Mech recipients and deferred mechanics retain their existing explicit deferrals. The legacy compatibility reconciler remains historical/transitional code; active migrated pages continue to use CharacterSession and the typed graph. This change does not declare the broader migration or UI work packages complete.

## Verification

The preflight passed 602 unit tests. The repair adds 25 controlled-fixture tests. The matrix covers Class features, Class options, Origins, Origin features, Feats and Feat options for fixed/chosen Techniques and Keystones. It also covers Trait weapons/linked attacks and Skill ranks across those sources, ordinary versus granted roll context, duplicate ownership, invalid parents/levels, nested Feat grants/options, group-owned grants, capacity, rank/filter parity, affected closure and Cancel/Apply/save consistency. Existing rolling, equipment, Trait, reconciliation and persistence regressions remain in the full suite.

Final full-workspace verification: **627 unit tests, 21 Firestore/Storage emulator tests, and 15 HTML asset checks**. The isolated staged change, excluding unrelated pre-existing work, passes **619 unit tests**. The ten-artifact production-data baseline and whitespace checks pass. Logs are `.staging/entity-consistency-preflight.log`, `.staging/entity-consistency-working.log`, `.staging/entity-source-matrix.log`, `.staging/entity-consistency-isolated.log`, and `.staging/entity-consistency-full.log`.

Authenticated local browser review confirms a level-2 Magical Guardian's Telepathic Link is both on the sheet and selected/locked in the builder, labelled **Granted by Dazzling Wand**, while ordinary capacity remains **0 / 3**. Search and expansion use the existing Technique card. Quick Roll on the independent rolling fixture produces the lower-right Hits/damage result; Roll with Modifiers retains the correct skill, attribute and zero optional modifiers. Exact emulator readback matches the pre-review saved documents, confirming the review did not mutate either character.

Local preview: http://localhost:5000/character-sheet.html?charId=dazzling-wand-review-20260928. Production has not been deployed. Pre-existing unrelated instruction/choice work remains separate. Remaining `WPE-DOMAIN-MIGRATION` acceptance precedes `WPF-UI-SYSTEM`, whose next work consolidates shared controls, accessibility and navigation; production publishing/deployment still require the user's instruction.

Browser fixture note: the older `rolling-review-20260927` seed omits three required canonical fields on each of its two weapons and emits the existing codec warning. It was preserved unchanged. A new disposable `entity-source-rolls-20260928` copy supplies those fields, passes the codec, rolls successfully without browser warnings/errors, and also matches its exact saved-document snapshot after rolling. Dazzling Wand likewise has no browser warnings/errors.
