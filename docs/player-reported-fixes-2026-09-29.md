# Player-reported fixes · September 29, 2026

Weaponsmith's bonus capacity was already included by shared Equipment Rules, but Equipment disabled every enhancement control when the weapon came from a feature. Optional enhancements are now editable on granted weapons. Commands target the canonical grant answer and let reconciliation refresh the generated weapon, preserving ownership. Automatic Soulbound remains protected and consumes no paid enhancement slot. Changing the original Class enhancement also preserves additional optional enhancements. Capacity, compatibility and dependency confirmation still use the existing shared Rules.

Heroic Combat Training's Ranged Weapons option supplied a weapon grant without an authored choice ID. Compilation correctly derived its identity, but the widget factory required an authored ID and rendered no picker. The factory now uses the same resolved identities as the graph, including multiple slots. Shared weapon-key, skill and tag filtering applies to both the picker and saved answers. Missing answers identify the feature and required choice instead of saying “This source-owned choice still needs an answer.” These reminders remain informational; validation errors and destructive confirmations retain their existing behavior.

Heading Background now colors section/table headings and Technique/combat-profile titles. Card bodies, skill chips and roll buttons follow Panel Background. No preference schema or persistence changes are needed.

## Authorized production character repair

The user explicitly allowed modifying Kazuma's live database entry and selected **Pistol** as the existing weapon to fulfill Heroic Combat Training. Read-only inspection distinguished the level-2 Henshin Hero from an older same-named character. A backup of the original document was written to ignored local staging before the change. A transaction required the inspected update time to match, then updated only the corresponding weapon answer, the existing Pistol's ownership metadata, revision and timestamp. Revision advanced **22 → 23**. Fresh readback exactly matched the expected builder.

The same Pistol identity is retained, all **three weapons** remain, and **Explosive Transformation** and **Chroma Ranger Initiate** are unchanged. The missing-weapon reminder is resolved. The older same-named character was untouched. No production website, Rules, Functions or game-data changes were made. The backup and repair script remain in ignored `.staging/kazuma-repair-*` files; private document paths and owner IDs are not included in this record. Rollback would require a fresh reviewed patch against current state, not blindly replacing a later revision.

## Verification

- Preflight: **666 unit tests**, **15 HTML assets**, unchanged ten-artifact production-data baseline.
- Full workspace: **671 unit tests**, **22 emulator tests**, **15 HTML assets**, all passing. Five new controlled regressions cover canonical enhancement edits/protection/capacity, preservation of extra enhancements, missing-answer labels and weapon filtering, implicit/multiple grant IDs, and heading-color scope.
- Isolated staged package: **663 unit tests**, **14 tracked HTML assets**, unchanged ten-artifact baseline; unrelated workspace changes excluded. Whitespace checks pass.
- Authenticated local browser: a pre-repair Kazuma clone shows the new ranged-weapon picker and specific missing-choice warning; a repaired clone has Pistol and both original feats selected. Removing and reselecting the class feat saves successfully without the missing-weapon warning.
- Local Soulbound fixture: the automatic enhancement is disabled, optional controls are enabled, and Lightweight plus Spiritual Weapon save and survive reload. No changes to the production character were made during browser testing.
- Local sheet: changing Heading Background to pink immediately leaves card bodies, skill chips and Quick Roll buttons white; the color persists after autosave/reload. Screenshots are saved in the task's `outputs/` folder.

Logs: `.staging/player-fixes-preflight.log`, `.staging/player-fixes-test-all.log`, `.staging/player-fixes-isolated-test.log`. Local preview: **http://127.0.0.1:5021/character-sheet.html?charId=customization-a-20260929**. Equipment fixture: **http://127.0.0.1:5021/builder/builder-equipment.html?charId=player-fixes-weaponsmith**.

Website changes remain local pending a subsequent explicit production-release instruction. Broader `WPE-DOMAIN-MIGRATION` acceptance remains open; `WPF-UI-SYSTEM` follows to consolidate shared controls, accessibility and navigation. This bounded repair does not complete either broader step.
