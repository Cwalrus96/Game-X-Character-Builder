# Weapon attributes and Fighting Styles

This follow-up repairs the reported weapon attribute and implements the existing Weapon Master Fighting Style benefits. The user chose to preserve the authored mechanics: recommended Techniques remain recommendations, and unfinished Enhanced Fighting Style benefits remain unfinished.

## Findings and source evidence

A read-only inspection of Damien's current character confirmed an Agility-primary Weapon Master with Agility 5, Strength 3, a Rank 1 Soulbound Spear carrying Agile Weapon, and Barrage Style. His saved enhancement was present; the weapon display and roll projection failed to apply it. No production character repair is necessary.

The canonical Sheet readback confirms Agile Weapon at `WeaponEnhancements!A7:H7`: Strength-based attack rolls and damage use Agility. `ClassFeatures!A493:K502` contains the Fighting Styles parent and nine options. Paired Weapons already has an explicit extra Rank 1 weapon grant; the others describe play effects. `A527:K529` contains Additional Fighting Style's existing option grant and the unfinished Enhanced Fighting Style option. A blank acquisition-grants cell does not turn a recommended Technique into a free learned Technique.

Read-only source provenance: Drive file `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`, source modified `2026-09-28T22:49:32.208Z`, Drive version unavailable. The bounded connector readback, including capture time, is retained at `.staging/weapon-style-source-readback-20260930.json`, SHA-256 `3225799397949392de629c3406b704cfa29d5e4e301e07aec83f3b20f4f7c407`. This is source evidence, not a complete acquisition or release candidate. Source cells and generated runtime artifacts are unchanged.

## Behavior and ownership

The pure weapon attack projection applies Agile Weapon to the specific owned weapon. Ordinary, source-owned and derived weapon cards, builder details and roll contexts share it. Underlying weapon attacks and inherited Weapon Attribute use the enhancement; explicit Technique attribute overrides retain precedence. An Agility-primary character without Agile Weapon still uses a weapon's authored fixed attribute. Current numeric damage formulas scale through the resulting Hits; the repair does not invent an extra attribute damage term.

Fighting Style Rules resolve active source-owned options and matching weapon tags. Conditions such as Aim, distance, bleeding and a previous Parry belong to the current roll, not canonical character state. The projection supplies passive weapon effects, conditional benefits and reminders. Recommended Techniques consume their ordinary acquisition route; this follow-up grants none automatically.

Barrage's weapon tag also feeds the shared prerequisite context and graph evidence, including callback-resolved choices and Origin features compiled before Class options. Source loss reviews dependent removals and preserves cancellation. Wrapper Techniques retain their outer authored attack range when deciding melee/thrown/ranged benefits; the underlying weapon still supplies damage and attribute. Unknown range formulas remain readable with an explicit multiplier rather than being partially evaluated.

| Style | Existing benefit represented |
| --- | --- |
| Sentinel | Extra damage equal to twice Melee Weapons rank when a Reach melee attack hits a nonadjacent target; failure damage receives no bonus. |
| Paired Weapons | Existing extra weapon choice remains in the builder; the sheet reminds the player of reduced flanking while wielding one-handed weapons in both hands. |
| Barrage | Matching thrown weapons gain Returning, with their wielding condition preserved in readable rules. |
| Marksman | Explicit Aim context doubles the range of ranged weapon attacks. |
| Skirmisher | Adjacent ranged/thrown attacks avoid their adjacency penalty and reaction trigger. |
| Titan | A Heavy melee critical success reports the target's temporary −1D Physical Defense effect. |
| Guardian | An explicit post-Parry condition adds +1D to a subsequent defense roll within the authored duration. |
| Smasher | Matching blunt weapons show the Bash alternative use and push outcomes. Source does not specify its full roll/action/cost context, so no new Technique or invented automatic roll is created. |
| Blademaster | Bleeding-target context reports −1D to the opponent's defense dice. It does not subtract 1 from TN: dice and rolled Hits are different quantities. |

## Verification and boundaries

Initial worktree was clean on `codex/work-package-b-data-contract`, HEAD `7aa6704`. Standard preflight passed on Node `v22.22.1`: 676 unit tests, all ten production data artifacts, and 15 HTML asset checks. Final `npm run test:all` passes **703 unit tests / 22 emulator tests / 15 HTML asset checks**, with zero failures. `npm run test:data` passes all three catalogue integration tests; `npm run baseline:data` matches all ten production artifacts; `git diff --check` passes. Final suite log: `.staging/weapon-style-verified-test-all.log`. An earlier in-progress suite caught a test fixture's zero primary attribute/zero Technique capacity; the corrected fixture sets its intended attribute before testing source loss.

Authenticated local browser verification covers:

- Damien's unchanged Agile Spear: Agility 5 plus Melee Weapons 1 produces 6d6, and Returning appears on the weapon. Expanded Equipment details use the same Agility/tag projection.
- Sentinel: with four Hits, base damage 5, and rank-one bonus 2, success damage is 11 and failure damage is 4. Changing TN to 6 preserves the same dice/Hits and highlights the failure band. Reopening clears the condition.
- Guardian: explicit post-Parry context changes the defense pool from 6d6 to 7d6. Keyboard focus survives condition changes; the control fits a 390×844 viewport without horizontal overflow.
- Marksman: the published Bow's `Range 20` becomes `Range 40` after Aim. Unsupported formulas retain the authored expression and an explicit multiplier, without partially rewriting numbers.
- Skirmisher and Blademaster: adjacency and bleeding controls show the appropriate effect; a bleeding target's entered TN remains unchanged.
- Titan: a Heavy melee critical result reports the temporary Physical Defense penalty; changing TN to a noncritical result removes that notice without rerolling.
- Smasher/Paired Weapons: matching cards show Bash outcomes and the conditional flanking reminder. Barrage's source benefit is shown alongside its derived Returning tag.
- Spread Volley preserves its explicit thrown delivery even though the underlying Spear profile is melee: no Sentinel bonus control is offered, while Skirmisher's adjacency control is available.

Exact emulator document readback matches all 12 before snapshots: Damien's copy, nine style fixtures and two thrown-wrapper fixtures. No browser save was performed. Local portrait warnings reflect the copied character's production portrait path, which is unavailable to the emulator identity; no portrait or Storage permissions were changed. No new sheet application error was observed. A stale local math module encountered during iteration was refreshed with versioned imports before final verification.

Local review uses disposable emulator characters, including a copy of Damien; the original production record is read-only. No canonical Sheet edit, data publication, production character write, Rules/Functions release or production Hosting deployment is included.

Review URL: `http://localhost:5000/character-sheet.html?charId=damien-agile-review-20260930`. The local Firebase environment was restarted with existing data preserved. The source-backed Bash text and all Enhanced Style TBD entries are the remaining mechanical authoring limits; implementing unstated mechanics would require a concrete rules decision and exact source-edit approval.

This bounded follow-up does not complete `WPE-DOMAIN-MIGRATION`. Its remaining domain/compatibility acceptance precedes `WPF-UI-SYSTEM`, which consolidates controls, accessibility, navigation and sheet structure. Those steps preserve source-edit, data-publish and production-deployment approval boundaries.
