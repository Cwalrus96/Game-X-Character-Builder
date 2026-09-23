# Handbook prose Technique migration — September 22, 2026

The user requested migrating newly authored handbook prose Techniques into the canonical spreadsheet. This is source-content work; it does not publish runtime data or deploy the website.

Thirteen Rank 2 Techniques were added to [Techniques!A156:AD168](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=A156:AD168). Ten came from “Techniques Not Yet Transferred to Spreadsheet” in handbook tab `t.yz4ctfxm1pnu`; three came from the Henshin Arts prose in tab `t.j3zbc5i2oiby`. The handbook itself was preserved, including unfinished design ideas and the prospective energy-sealing note.

| Row | Technique | Stable key |
| --- | --- | --- |
| 156 | 8 Trigrams Rotation | `eight-trigrams-rotation` |
| 157 | Living Shield | `living-shield` |
| 158 | 8 Trigrams Sealing Palms | `eight-trigrams-sealing-palms` |
| 159 | Driving Barrage | `driving-barrage` |
| 160 | Shatter Earth | `shatter-earth` |
| 161 | Rising Dragon Counter | `rising-dragon-counter` |
| 162 | Lotus Lock | `lotus-lock` |
| 163 | Divergent Fist | `divergent-fist` |
| 164 | Hurricane Kick | `hurricane-kick` |
| 165 | Piledriver | `piledriver` |
| 166 | Cast Off Armor | `cast-off-armor` |
| 167 | Block the Blast | `block-the-blast` |
| 168 | Synchronized Assault | `synchronized-assault` |

Costs, timing, targets, triggers, outcomes, rank benefits and damage occupy their existing columns. Driving Barrage, Rising Dragon Counter, Divergent Fist and Piledriver reference `unarmed-strike` through `basicAttack`, use `rollRequired=N`, and leave independent-roll details blank. Their attack counts and modifiers remain in descriptions. Damage growth does not name a particular skill. No pumping is invented. Cast Off Armor's active-transformation restriction stays a gameplay use condition in its description, not a static acquisition prerequisite. Block the Blast uses the incoming attack's ordinary defense roll; it introduces no additional Technique roll.

## Mechanics needing clarification

The source retains the following authored meanings or blanks; import success does not decide these game-design questions.

1. **Living Shield:** Martial Arts access, but the roll explicitly says Strength (Melee Weapons). `associatedSkill=Melee Weapons` preserves that override pending confirmation.
2. **Driving Barrage:** the target line requires a creature grappled by the user. Confirm whether that requirement is intentional.
3. **Lotus Lock:** Action or Reaction is explicit, but no Reaction trigger is supplied. The trigger cell remains blank.
4. **Hurricane Kick:** attacks are specified without identifying their damage or saying they are Unarmed Strikes. The authored Primary-versus-Physical roll is retained; damage and `basicAttack` remain blank.
5. **Block the Blast:** ordinary success improves one ally's result, while critical success protects all allies. Confirm whether the singular ordinary-success target is intentional.

## Verification and operational evidence

- Preflight: 469 unit tests pass; all ten published artifacts match the baseline. No application code changed for this migration.
- A pure proposal check passed before source writing with zero errors and the existing 115 warnings. All 154 prior Technique records retained their normalized runtime representation.
- Native readback verifies the 390 new cells and adjacent rows, retaining formatting and validation. The preformatted blank rows required only content writes.
- Extending the existing filter initially reapplied its stale rank-sort specification. Recovery restored the original row order and native cell metadata by stable key, including the separate final `basicAttack` column. A full 5,010-cell native readback passed after recovery. The final filter covers `A1:AD168`, preserves criteria, and has no stale sort instruction; future sorting includes every field.
- The final native export proves all twelve other tabs and all 154 pre-existing Technique rows unchanged in order and content. Empty-string versus absent-cell serialization is normalized only for the preservation comparison. The resulting source has 167 Techniques.
- The dependent display formulas require no edits. All thirteen names appear in the 136-row main `Techniques_Display` catalogue with no formula errors. Rich-text output regeneration and handbook linked-table refresh were not performed or claimed.
- Google-rendered source rows were visually checked at 100% zoom; titles, keys, wrapped descriptions and the three Henshin Arts additions are readable. Existing dimensions and formatting were retained.
- Final immutable run: `20260923T000831868Z-54916`; ten artifacts; zero errors; 115 pre-existing warnings; runtime loading passes and a complete production-relative diff is recorded. The candidate also contains previously staged, unpublished source changes; it is not a thirteen-row-only production release.
- Source modification time: `2026-09-23T00:04:11.190Z`; Drive version unavailable/null. Native XLSX SHA-256: `8186897e302e814ef05785132cb2d6ce8d7d83ab84ecd48bb926591a5495db5b`; 472,886 bytes. Source ID is the canonical contract ID. Snapshot, provenance, before/after comparisons and proposal evidence are ignored under `.staging/handbook-techniques/`.
- Final production baseline and `git diff --check` pass. Concurrent Class/Origin/Trait UI work and AGENTS guidance edits are separate and preserved.

Next data release boundary remains `WPB-REQUIRED-CELLS-RELEASE`: review the complete candidate, resolve or explicitly retain these unfinished mechanics, and obtain the user's production instruction before publishing the matching data and website. Existing `WPE-DOMAIN-MIGRATION` implementation work is separate.
