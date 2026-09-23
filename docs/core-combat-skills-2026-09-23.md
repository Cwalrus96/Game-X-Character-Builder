# Core Combat Skills — September 23 decision

Martial Arts, Melee Weapons, and Ranged Weapons remain Combat Skills and are also Core Skills. Every character has access at Rank 0 and may spend Skill Points to improve them under the ordinary rank cap and point budget. Class and feature ranks remain free minimum ranks; spending covers only ranks above the grant. This does not make other class-specific skills universally available or waive Technique prerequisites.

## Application and compatibility

The previous Rules already recognized all three for every character and charged paid ranks above granted floors correctly. The Skills widget displayed their common grants as locked rows, leaving no direct upgrade control. Shared Skill Rules now declare Core Combat membership once and expose a permanent allocation projection for the three controls. Skills and the read-only character sheet place them under Core Skills without duplicating them in Combat & Class Skills.

Purchased ranks remain in `builder.sheet.repeatables.combatSkillsExtra`; the existing fifteen `CORE_SKILL_FIELDS` remain their established scalar storage bindings. A visible Rank 0 or an automatic free rank does not create a paid saved answer. Historical Targeting aliases map to the Ranged Weapons control. Technique, weapon, Trait-scaling and prerequisite consumers retain the same effective Combat ranks. Typed commands and graph reconciliation continue to review caps, budgets and dependent removals before acceptance. Removing a free grant preserves purchased ranks subject to the reviewed budget.

## Source and handbook

Read-only native inspection of the [canonical Sheet](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit) covered tab metadata, `Classes!A1:Y16` and `Enums!A1:C194`. The source has no global skill-category registry. Its three Classes skill fields define distinct class relationships, including free progression and Technique access; they are not an exclusive list of trainable skills. Existing Martial Arts and Weapon Master progression and Technique references remain correct. No source-cell, schema, exporter, formatted-sheet or generated-runtime-data change is required for this decision. No source write or data publication occurred.

Five paragraphs in the [Player's Handbook](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit) now explain the decision: the Combat Skills and Core Skills introductions in Basic Mechanics, and initial skill spending, level-up spending and general Combat Technique access in Character Building. Class-exclusive examples and class progression tables retain their meaning. Changes preserve paragraph boundaries, native list nesting and inherited body styling.

The trusted prewrite read found no protected controls. A revision-guarded batch updated exactly those paragraphs. Native readback verifies all five replacements, unchanged tab topology, the text of all 49 tables, all unrelated top-level paragraph text and text styles, and the original paragraph/list styles of the changed passages. Before revision: `ANLCKQlrV6EQ13AMTA_L67rJ-DSvDpEdtNoo8ZgknasTynZiYbnYgyfxwcjigd-w4qjz1EzQt7xVKcHgkQ`. After revision: `ANLCKQkIKTh078e84UjdQoPDdjLRyNgHuBD0ki0ZrvMTAV1aqVbXCDR30EJhWdIwYsyzMIqCEIw1u0KKSA`. Ignored evidence: `.staging/core-combat-handbook-native3/` and `.staging/core-combat-handbook-verification.json`.

## Verification and boundaries

- Preflight: 503 unit tests pass and all ten reviewed production artifacts match their baseline.
- Seven controlled regressions cover universal/classless access, exclusion of other skills, paid/granted ranks, caps/budgets, alias and higher-grant compatibility, class changes, codec/session round trips, dependent Technique removal and cancellation, widget replacement/reset and accepted-state restoration.
- Full workspace verification: `npm run test:all` passes 517 unit tests, 20 Firebase emulator tests and all 14 HTML asset checks. The count includes concurrent work, which remains separate from this feature.
- Authenticated local reader/writer verification creates a disposable Magical Guardian and saves/reloads all three purchases exactly. The browser raises all three to Rank 2, charges six points, preserves the purchases while adding/removing another skill, and saves/reloads them. Native browser checks verify all three read-only ranks under Core Skills on the character sheet, with only Spellcasting in Combat & Class Skills. Both layouts were visually inspected at the browser's narrow viewport.
- Local Firebase restart exported and preserved existing emulator data. A fresh no-cache preview avoids stale cached modules on port 5000: **http://127.0.0.1:5027/builder/builder-skills.html?charId=hKsk4AbOehinp7GJbEO2**. Only this new local test character was saved.

Logs and local fixture evidence are ignored under `.staging/core-combat-*`. The website change is local only. Production data, Hosting, Rules, Functions and production characters are unchanged. Production deployment still requires the user's explicit instruction.

This finishes the requested Core Combat Skill change within active `WPE-DOMAIN-MIGRATION`, not the entire work package. Remaining supported mechanics and compatibility cleanup precede `WPF-UI-SYSTEM`, which consolidates shared controls and accessibility. `WPB-REQUIRED-CELLS-RELEASE` remains the separately approved complete data/application release boundary; no new data release is needed solely for this change.
