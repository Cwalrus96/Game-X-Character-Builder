# Source content decisions — September 21, 2026

This record supersedes the earlier 39-question review. Q01–Q39 retain their original identities, but answered questions below are decisions, not outstanding approval requests. The user’s fresh source edits are part of the evidence: a finding from the earlier snapshot does not remain open merely because this cleanup did not edit that cell again. Sheet links identify the reviewed rows; current implementation and verification checkpoints belong in [status.md](status.md).

The source cleanup preserves authored mechanics and unique identities, moves meaningful grant summaries into descriptions, and removes stale duplicate representations. `grantText` is retired from ClassFeatures, OriginFeatures, and Feats after preserving the 16 meaningful descriptions found during its audit. Formal grants and references supply the corresponding display text. The three Classes fields—`combatTechniqueSkill`, `combatSkills`, and `utilitySkillOptions`—remain distinct and authoritative. Techniques retain `strainCost` and `onCriticalFailure`.

Incomplete records are valid authoring and migration input. Missing mechanics remain visible findings; they do not require the user to finish every class before schema integration can proceed. Existing readiness is preserved unless explicitly changed. Importing an unfinished record does not make it selectable or executable. Broader class design is held for later work.

## Resolved mechanics and access

| Original finding | Accepted decision |
| --- | --- |
| **Q01 — [Daggers / Kunai][daggers]** | Add Melee alongside its existing Thrown and other tags. Preserve its current `dagger_kunai` identity and both basic attacks. |
| **Q03–Q05 — [Rider Kick][rider-kick], [Doppelganger][doppelganger], [Binding Vines][binding-vines]** | Use the Technique’s rank and associated skill, including a provider’s associated skill where applicable. Rider Kick is not forced to scale with Henshin Arts when selected through Martial Arts. Doppelganger uses Primary with the associated skill. Binding Vines retains its initial and ongoing damage formulas without hard-coding Metamorphosis. Weapon attacks continue to use weapon rank. |
| **Q06 — [Dynamic Pose][dynamic-pose]** | One Action normally; a free Reaction after defeating a non-minion. `ActionOrFreeReaction` records the conditional cost. The free route must not inherit the normal one-Action cost. |
| **Q07 — [Energy Transfer][energy-transfer]** | The sender’s current Energy limits the transfer, whichever direction Energy moves. |
| **Q08 — [Deflect Projectile][deflect-projectile]** | Allow either a wielded Melee weapon or unarmed Martial Arts. Deflect Energy inherits the same prerequisite. The formal requirement preserves the OR relationship. |
| **Q09 — [Armor Crusher and Vicious Rend][armor-rend]** | Suitable melee or ranged basic attacks work. Preserve the respective Blunt and Sharp requirements and existing effects. |
| **Q10 — [Smoke Teleportation][smoke-teleportation], [Magic Hand][magic-hand], [Spirit Shades][spirit-shades], [Watercolor Illusion][watercolor-illusion]** | Preserve the user’s supplied mechanics: smoke and concealed movement; remote object movement with scale/range limits; sustained Spirit Sight at 12 squares; and a 3-Energy static illusion with rank-based scale. Watercolor Illusion’s cost kind is fixed, matching that supplied cost. These are no longer the empty/TBD records described in the initial review. No readiness demotion is needed to address that superseded finding. |
| **Q11 — [Restraining Ribbons][restraining-ribbons]** | Preserve the user’s added Damage 4 + Hits, increasing by 3 per rank above 1. Success Immobilizes until the end of the target’s next turn; failure applies Slowed instead. Do not invent a separate duration or replace the updated rule. |
| **Q12 — [Spirit Flight][spirit-flight]** | Remove the erroneous Healing tag; its flight mechanic remains intact. |
| **Q13 — [Group Teleport][group-teleport]** | No opposed roll is required for the authored willing-target teleport. Remove the stray roll/attribute/Defense fields while retaining its costs, targets, and distance. |
| **Q14 — [Pistol Bullet Spray][bullet-spray] and [Machine Gun Bullet Spray][machine-gun-spray]** | Each invokes its own weapon’s basic attack, preserving the authored area, attack application, costs, and reload rule. Reference `pistol-basic-attack` and `machine-gun-basic-attack` respectively. Machine Gun’s existing draft status remains; resolving the attack reference does not promote readiness. |
| **Q15 — [Shield Bash][shield-bash]** | A successful hit pushes 1 square plus 1 per Hit above Defense. Preserve the separate failure result. |
| **Q16 — [Wing Blast, Spike Volley, Engulf, Claw Slash, and Spike Shot][trait-attacks]** | The stated base damage is already the Rank 1 amount. Growth is explicitly “per rank above 1.” Preserve every coefficient. |
| **Q17 — [Engulf][engulf]** | Grapple the target; the user is not Immobilized. Preserve ongoing damage while the target occupies the user’s square and termination when the user moves. Its existing incomplete status remains. |
| **Q18 — [Mythic Rebirth, Mark Prey, and Know your Enemy][emblem-techniques]** | These are granted by their Emblems, rather than ordinary Henshin Arts selections. |
| **Q19 — [Restraining Beam and Repulsor Blast][beam-techniques]** | The new Rank 1 Beam Blaster Trait (`beam-blaster`) grants both Techniques and the acquired Beam tag. Use `selection=granted`, a formal Beam tag prerequisite, and the provider’s associated skill. Remove the fabricated “Combat Skill” selection. Keep both Techniques’ draft status. |
| **Q20 — [Elemental Blast][elemental-blast]** | Its ordinary prose establishes Elementalism access, so `selection=Elementalism`. Keep provider-granted access and associated-skill overrides, including Elemental Blaster. This correction does not promote readiness. |
| **Q22 — [Explosive Transformation feat][explosive-feat] and [Technique][explosive-technique]** | The feat grants the canonical scaling Technique. Remove the stale copied flat-damage attack from the feat and follow its existing Technique reference. Ordinary Henshin Arts access remains as authored. |
| **Q23 — [Energizing Aura][energizing-aura]** | `+1/2D` means a half-die Status Bonus to Physical and Spiritual Defense rolls. Preserve its Power Die benefit. |
| **Q34 — [Ranger Mecha][ranger-mecha]** | Replace nonexistent Glider with Wings, whose Rank 1 benefit is gliding. Preserve the emblem-dependent choices and aura location. |
| **Q35 — [Stable Timer][stable-timer]** | Add Henshin Arts skill rank, not Henshin Hero class level. |
| **Q36 — [Eyes of Legend][eyes-of-legend]** | The handbook supplies a 12-square Spirit Sight range. The user's follow-up fixes duration at the end of the user's current turn. Keep 1-Energy activation and the visible eye change. Both range and duration are now in the source. |
| **Q38 — [Living Archive][living-archive]** | The Artifact owns three Rank 1 skills and can Assist its wielder for 2 Energy. `recipientRef=artifact` identifies the existing bonded Artifact; these grants do not train the player character. |

## Class and feat decisions

**Q25 — Mech Pilot.** Its normal utility options are exactly Vehicles, Science, Technology, Society, or Academics. Remove Chemistry from the separate [Utility Training feature][chemistry] and retire that obsolete child option. Keep that feature’s distinct automatic Technology training plus a choice of Science, Crafting, or Observation. The three Classes skill columns have different purposes and remain authoritative.

**Q27 — [Transformation Keystone][transformation-keystone].** Represent one source-owned Keystone with `choice | type=keystone | count=1`. Its repaired identity is `transformation-keystone`; Metamorphosis Techniques retains `metamorphosis-techniques`.

**Q28 — [Monster Evolution][evolution].** The full conditional rule applies at levels 2, 4, 6, 8, and 10. Write it once on `monster-evolution`; the four later features use `feature | featureKey=monster-evolution`. Each application owns a fresh answer rather than reusing the level-2 companion choice. The canonical rule still compares an existing companion’s rank with Monster Taming and otherwise grants the stated Stage 2/3 evolution and Familiar Traits, including the authored action/Energy costs. Remove the incorrect unconditional familiar-plus-rank grants. Conditional execution remains deferred; these references do not claim that a general conditional grant engine exists.

**Q30 — [Clone School][gadget-school].** Clone School replaces the abandoned Gadget School concept. Preserve the existing `gadget-school` identity used by references; changing the concept does not require renaming a stable key. Clone mechanics remain TBD because no replacement mechanics were supplied.

**Q31 — [Celestial Knight Path Initiate][celestial].** Follow the prose: grant Beginner training and Slow progression in both Melee Weapons and Ranged Weapons. It is an automatic feature, so remove the choose-one count and obsolete option contents.

**Q32 — [Chroma Ranger Initiate][chroma] and conflicting grants generally.** Current intended prose takes precedence over stale formal summaries where the user’s decision or fresh source makes that intent clear. Chroma Ranger uses Shared Emblem; remove the obsolete color choice and Boost resource grants. Preserve unique meaningful rules before retiring duplicate grant text. This policy is not permission to resolve a genuinely ambiguous rule by inventing mechanics.

**Q33 — [Mixed Stance][mixed-stance].** Its current description and requirements are correct: combine two known stances, requiring at least two known stances and Spirit Warrior level 4. It does not grant an extra stance. Replace the invalid resource prerequisite with `option | groupKey=stances | count=2`; count distinct known options, not uses or only the active stance. Retire the stale grant summary.

**Q37 — [Multiple Simultaneous Summons and Monster Fusion][summon-feats].** Preserve their authored level-2 and level-4 prerequisites and remove the old notes claiming those levels are unspecified. Remove the misleading “higher-level” wording from Multiple Simultaneous Summons. Monster Fusion’s unfilled `X` Energy cost remains part of the unfinished design backlog; no amount is invented.

## Content intentionally left unfinished

These are retained source records and future content work, not a demand to complete all design before migration.

- **Q02 — [Weapon enhancements][unfinished-enhancements].** High-Impact Ammunition is resolved: the fresh source pushes a successful target by the full weapon rank; the older handbook’s half-rank wording must agree. Energy Drain still lacks its amount; Freeze Beam, Lightning Launcher, Flamethrowing Weapon, Explosive Ammunition, and Beast Bullets retain their incomplete attack details. The Lightning Launcher copy note remains an explicit unresolved detail. Preserve their current records without inventing statistics or silently changing readiness.
- **Q24 — Higher class features.** Hold broader design for [Super Heroic Transformation and Improved Emblem][hero-upgrades], [Ultimate Heroic Transformation][ultimate-hero], [Advanced Accessories][advanced-accessories], [Advanced Stances][advanced-stances], and [Enhanced Fighting Style][enhanced-styles]. Preserve all nine named enhanced styles: Sentinel, Paired Weapons, Barrage, Marksman, Skirmisher, Titan, Guardian, Smasher, and Blademaster.
- **Q29 — [Ultimate Weapon Transformation][ultimate-weapon].** Stage 1 acquisition and the incomplete Fusion/Colossus Stage 2 effects remain held with broader Weapon Master design. Preserve the authored transformation costs and benefits already present.
- **Q39 — Other unfinished families.** Retain the [Ninja schools][ninja-schools], [Chimaera placeholders][unfinished-metamorph-feats], [two new Apex placeholders][apex-placeholders], [19 multiclass placeholders][multiclass-placeholders], and [AI Autopilot / Copilot][ai-trait]. Both Chimaera placeholder identities now exist (`chimaera-feat-1`, `chimaera-feat-2`); the earlier missing-key finding is obsolete. The user also added `apex-feat-1` and `apex-feat-2`, both still TBD. [Apex Path Initiate][apex-initiate] now has Transformation Overcharge: spend 1 Strain on a Natural Weapon attack to treat that attack's skill as one rank higher. Its earlier missing-mechanic finding is closed. Faithful readiness handling belongs in integration; completion of the remaining placeholder rules is separate design work.

Eyes of Legend's duration (Q36) is resolved by the user's follow-up: until the end of the user's turn. Monster Fusion's unspecified Energy amount (Q37) remains intentionally unfinished.

## Formal authoring and deferred software support

**Q21 — [Basic-attack Techniques][dual-strike].** `rollRequired` means a separate Technique-specific roll. The optional `basicAttack` field records the underlying weapon, unarmed, or named Technique attack and any authored override. Setting a wrapper to `rollRequired=N` does not remove the basic attack’s roll. The first verified batch populated 30 records; the applied Machine Gun follow-up brings this to 31. Preserve Taunting Strike’s alternatives and each attack’s costs, targets, and outcomes.

**Q26/Q38 — Ownership and conditional rules.** The remaining work is faithful software representation of established mechanics. No further decision about whether to preserve these rules is needed:

| Source | Meaning to preserve during integration |
| --- | --- |
| [Metamorphic Transformations and Metamorphosis Techniques][metamorph-features] | Three Traits chosen from Anatomy/Material/Senses; Metamorphosis association and six-square sensory range; Rank-0 Martial Arts access and access through acquired Trait tags/Natural Weapons. |
| [Tamer Bond][tamer-bond] and [Monster Rank Up][monster-rank-up] | Monster Taming-based bonds, bonds between companions, the critical-failure Tame Monster case, and rank increases for every existing companion. Do not turn these into an unconditional new companion. Broader Monster Tamer design remains held. |
| [Exceptional Piloting][exceptional-piloting] and [Exceptional Stealth][exceptional-stealth] | Their specific skill’s +1 rank-cap exception, alongside training. |
| [Advanced Spellcasting][advanced-spellcasting] and [Master Spellcasting][master-spellcasting] | Optional replacement of one eligible known Technique, not an extra learned Technique. |
| [Shining Weapon][shining-weapon] and [Charms][charms] | Magical applies to weapon attacks. Charms exist during the transformation; unspent Charms disappear when it ends. |
| [Living Archive][living-archive] | Three Rank 1 skills belong to the Artifact. Resolve the recipient reference; an unknown recipient must not silently become the player. |
| [Giant of Light Initiate / Innate Psionics][giant-of-light] | One Psionics Technique, list access, Henshin Arts association, and the Giant of Light form restriction until Innate Psionics removes it. |
| [Masked Rider Initiate][masked-rider] | Two armor-mode choices; apply benefits according to the active mode and retain Sensor Mode’s range. |
| [Chimaera Path Initiate][chimaera-initiate] | Two additional known Traits, the three-active limit, and existing transformation/switching rules. |
| [Ranger Mecha][ranger-mecha] | The mech owns its emblem-dependent Trait; preserve the piloted aura’s location and corrected Wings reference. |
| [Well Trained][well-trained] and [Giant Weapon / Martial Mech][mech-choices] | Apply skills, weapons, and Techniques to the actual Trait/mech recipient, with the existing rank and Pilot/skill relationships. |

The handbook cross-check also preserves Slimefolk’s human/slime forms: Inorganic Nature, Liquid Form, Dissolved Storage, and Slippery apply in slime form, with no associated skill. Existing provider identities remain. The newer Inorganic Nature prose includes not needing to eat, sleep, or breathe; the refreshed handbook must retain it.

The user's later [Integrated Weapon edit][integrated-weapon] changes its source identity from `mech-integrated-weapon` to `integrated-weapon`, lowers its minimum rank to 1, and replaces the mech-only wording with a limb-integrated weapon whose rank cannot exceed the Trait rank. The captured source contains no remaining formal reference to the old key. Future integration must assess saved-state identity compatibility and preserve the old identity where necessary; this source edit does not itself migrate persisted characters.

Authoring schema v5/syntax v3 now describes the accepted references, recipients, known-option counts, and conditional action wording. Runtime acquisition, parsing, graph execution, and saved-state compatibility remain the separate `WPB-SCHEMA-V5-INTEGRATION` work. That step must preserve unfinished records and report unsupported mechanics honestly.

## Verification boundary

The first decision batch passed independent exact value/request-replay verification, native formatting/validation/note/rich-text preservation checks, and relationship checks. All 14 concurrent Trait-tag edits were preserved. Feature references are acyclic; basic-attack, parent, Trait-to-Technique, and Schema-header checks passed. Repository verification reached 300 passing unit tests before the final source/display follow-ups.

Recovery snapshots, proposals, exact requests, and verification are under ignored `.staging/content-decisions-2026-09-21/`; the earlier audit history remains under `.staging/content-audit-2026-09-21/`. Final native display/handbook results and source provenance are recorded in [status.md](status.md). This decision record does not claim runtime publication or website deployment.

[daggers]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1782767706&range=10:10
[unfinished-enhancements]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=954265338&range=16:26
[rider-kick]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=3:3
[doppelganger]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=50:50
[binding-vines]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=51:51
[dynamic-pose]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=6:6
[energy-transfer]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=11:11
[deflect-projectile]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=39:39
[armor-rend]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=47:48
[smoke-teleportation]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=54:54
[magic-hand]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=64:64
[spirit-shades]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=67:67
[watercolor-illusion]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=69:69
[restraining-ribbons]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=59:59
[spirit-flight]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=84:84
[group-teleport]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=87:87
[bullet-spray]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=108:109
[machine-gun-spray]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=131:131
[shield-bash]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=116:116
[trait-attacks]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=144:148
[engulf]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=146:146
[emblem-techniques]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=14:16
[beam-techniques]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=132:133
[elemental-blast]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=135:135
[dual-strike]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=41:45
[explosive-feat]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=57:57
[explosive-technique]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1925001475&range=2:2
[energizing-aura]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=96:96
[hero-upgrades]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=97:98
[ultimate-hero]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=103:103
[advanced-accessories]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=175:175
[advanced-stances]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=448:448
[enhanced-styles]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=524:524
[chemistry]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=230:234
[metamorph-features]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=235:236
[transformation-keystone]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=237:237
[evolution]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=288:302
[ultimate-weapon]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=525:527
[gadget-school]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=2:2
[celestial]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=9:11
[chroma]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=59:59
[mixed-stance]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=39:39
[ranger-mecha]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=61:61
[stable-timer]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=64:64
[eyes-of-legend]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1354829599&range=7:7
[summon-feats]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=25:26
[living-archive]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1354829599&range=3:3
[ninja-schools]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=2:4
[unfinished-metamorph-feats]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=77:78
[apex-initiate]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=79:79
[apex-placeholders]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=80:81
[multiclass-placeholders]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=82:100
[integrated-weapon]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=920260001&range=28:28
[ai-trait]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=920260001&range=37:37
[tamer-bond]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=285:285
[monster-rank-up]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=291:291
[exceptional-piloting]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=225:225
[exceptional-stealth]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=328:328
[advanced-spellcasting]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=159:159
[master-spellcasting]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=163:163
[shining-weapon]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=152:152
[charms]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=99671034&range=149:149
[giant-of-light]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=62:63
[masked-rider]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=65:65
[chimaera-initiate]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=1031532335&range=76:76
[well-trained]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=920260001&range=9:9
[mech-choices]: https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit#gid=920260001&range=17:18
