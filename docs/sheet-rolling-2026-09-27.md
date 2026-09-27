# Character Sheet rolling — September 27, 2026

## Scope and accepted rules

The first rolling milestone adds a portable roller to the existing Character Sheet. Players click an Attribute or Skill directly to open **Roll** with that value preselected and choose the other. Defense values also open the corresponding defense Skill. Techniques and weapon attacks have a right-aligned vertical stack: **Quick Roll** above **Roll with Modifiers**. Techniques with no roll and no underlying attack have no action button. There is no Resources-area roll button.

Quick Roll immediately rolls the default attack, Skill and Attribute with all optional modifiers, extra damage and pumping reset to zero. Authored mechanics, such as Devastating Blow's intrinsic penalty, still apply. If the source does not establish a usable default Attribute/Skill, the small picker requests the missing choice instead of inventing a value. Roll with Modifiers opens the same picker with the adjustments expanded.

Results appear in a compact, nonmodal window fixed at the lower right; the rest of the sheet stays usable. Setup is hidden after rolling, while damage bands remain immediately visible and detailed calculations/effects are collapsible. A target number is optional and can be entered or changed after rolling. Each result retains its original pool, faces, Hits, skill/attribute, weapon, pumping and damage adjustments; interpreting a TN never consumes randomness again. The last ten rolls remain available in memory for the current sheet session.

Rules are cross-checked against the Player Handbook (Drive document `1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss`) and the structured current catalogue. The user's explicit clarifications govern zero dice, the separate half-die coin, optional late TN, and rounding down half damage.

- The pool uses the chosen Attribute, effective Skill rank and player-entered modifiers. A zero Attribute or nonpositive final pool yields 0 Hits without random draws.
- d6 faces 1–2, 3–4 and 5–6 give 0, 1 and 2 Hits respectively. Only ten whole dice roll; excess whole dice give one automatic Hit each. A remaining half die is an independent, fair 0/1 coin, outside the cap. Thus 11.5 dice means ten d6, one coin and one automatic Hit.
- TN is compared to Hits. Margin −4 or lower is critical failure; −3 through −1 is failure; 0 through +2 is success. Every additional three margin adds one critical tier.
- Attack damage includes authored base damage, skill/weapon-rank growth, actual Hits, supported Energy X and damage pumping, and explicit player adjustments. The table shows 0 damage, half rounded down, full, ×2, ×3, ×4 and further attainable critical tiers. It is before target armor/resistance. Players may choose normal critical damage when taking an alternative critical effect.
- Fixed Attributes are retained; matching class skills default to the character's Primary Attribute. Borrowed skills with an unspecified Primary require an explicit Attribute. Defense checks default to the better of their paired Attributes.
- Owned weapon contexts, Trait providers, effective grant ranks and permitted substitutions come from shared Rules. Typed `basicAttack` references select the underlying attack instead of inventing another roll. Weapon rank determines weapon damage/pumping independently of the rolling Skill rank.

## Boundaries

September 28 layout refinement: sheet Technique/weapon profiles place their title and all rules in one content column, with Quick Roll and Roll with Modifiers in a separate right-hand column. Button height no longer inserts space between the title and Skill/details. The shared renderer still produces its original markup when no controls are supplied. Desktop and 390px browser checks confirm the column layout and both roll entry points.

Pure `roll-rules`, `damage-rules` and `sheet-roll-context` modules own mechanics. A separate `dice-random` adapter uses unbiased cryptographic random faces. The widget renders the result and parses local input; the sheet coordinator registers controls and supplies the loaded character. Existing shared Technique and weapon presentation accepts an optional Roll control, leaving builder callers unchanged.

The nonmodal dialog is outside `#sheet`, has no save-owned input names, imports no persistence, and never changes HP, Strain, Energy, conditions or the character build. Attribute rows and Skill chips use native buttons with the existing sheet styles and keyboard focus. Close/Escape restores focus to the opener. Existing HP direct values, signed adjustments and persistence remain intact. Animation can later present the already-generated result without owning mechanics or drawing replacement dice.

This milestone resolves one attack at a time, including when prose calls for multiple separate attacks. Conditional bonuses, defenses, armor/resistance, resource use, triggers and effect application remain player adjudication. The modifier fields accept one net value per modifier type and a separate Other adjustment; the UI explains that same-type bonuses do not stack. The exact authored attack-penalty and doubled-damage-Hits phrases used by Devastating Blow are recognized; arbitrary prose is never executed. Compact damage formulas are conservatively parsed, with unsupported text explicitly requiring manual calculation. Non-damage pumping stays in the displayed technique rules. Missing or cyclic references and unmet weapon requirements are reported rather than replaced with fabricated attacks.

## Verification

Preflight: **569 unit tests**. Focused additions: **22 tests**, covering all die faces, zero draws, half coins/cap/overflow, random-byte rejection, optional and late TN, damage rounding and tiers, rank bases/pumping/X, malformed input, borrowed and defense Attributes, substitutions/providers, weapon sets, wrappers, cycles, incomplete records, no-roll effects and save isolation.

Authenticated browser checks on disposable local characters verify:

- Zero Attribute produces no dice and 0 Hits without TN.
- A Strength 4 / Melee Weapons 2 sword attack rolls six dice. With six Hits, TN 7 highlights failure damage 7, then TN 3 highlights critical damage 28 using exactly the same faces. Invalid TN removes the highlight without rerolling.
- Devastating Blow selects the owned Heavy weapon, applies −2 dice, doubles damage Hits and adds pumping. A three-Hit result with two pumping Energy gives full damage 19 and failure damage 9.
- An 11.5 pool displays ten dice, one coin and one automatic Hit; a 0.5 pool displays only a coin. Invalid modifiers disable Roll.
- The ordinary attack, wrapper and custom entry points work with keyboard activation. Phone-width results retain a readable three-column damage table and reachable Close control.
- Emulator document readback is exactly unchanged after rolls and TN edits. The separate HP save/reload regression is recorded in the completion status.

A read-only installed-catalogue smoke check resolves all **154 playable techniques** without exceptions; every current nonblank compact damage formula parses. Controlled unit fixtures remain independent of published content.

The subsequent interaction redesign passes a **591-unit preflight** and **596 units, 21 emulator tests and 15-page asset validation**, including five additional coordinator regressions. Browser checks verify Attribute/Skill preselection, preserving the selected Attribute when choosing a Skill, paired defense defaults, keyboard activation, immediate Quick Roll, modifier reset (11.5 modified dice followed by the default six-die Quick Roll), four-die Devastating Blow, late TN without rerolling, and the fixed lower-right desktop/390px layouts. The browser result with 5 Hits gives 13 full damage and 6 failure damage. Exact local document equality confirms these interactions save no character changes.

Full-suite results, baseline verification and final local review are recorded in [status.md](status.md). Local preview: `http://localhost:5000/character-sheet.html?charId=rolling-review-20260927`. No canonical source cells, generated production data, production characters or deployed services are changed. Broader `WPE-DOMAIN-MIGRATION` acceptance and `WPF-UI-SYSTEM` remain separate roadmap work; animated dice are a possible subsequent rolling milestone.
