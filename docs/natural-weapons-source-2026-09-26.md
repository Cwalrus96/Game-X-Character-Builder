# Natural weapons and Metamorph technique source update

The user authorized canonical-Sheet edits on September 26, accepted Natural weapons as WeaponBases, retained body-level tags, and required Natural bases to stay out of the Player Handbook Weapons section. This checkpoint updates authoring and display support; it does not implement the new character-builder mechanics or publish runtime data.

## Accepted grant contract

```text
weapon | weaponKey=crushing-limbs | count=2
weapon | weaponKey=web-shooters

technique | access=Melee Weapons OR Ranged Weapons | weaponTag=Natural
skill-substitution | fromSkill=Melee Weapons OR Ranged Weapons | toSkill=Metamorphosis | weaponTag=Natural
skill-substitution | fromSkill=Martial Arts | toSkill=Metamorphosis
```

Natural is an ordinary weapon tag, not a new kind field. Weapon tags and basic attacks are authored once in WeaponBases.tags and WeaponBases.techniqueKeys. Trait weapon grants inherit the provider Trait's rank and associated skill; count uses the existing syntax and produces distinct weapon instances. Forms and which limbs are currently used remain player-tracked gameplay conditions. Count two matters to existing static weapon-set prerequisites such as Dual Strike.

An explicit technique access grant opens normal learned selection and grants no free selection. It may use a matching skill substitution's destination rank to qualify, with the Technique's weapon requirements satisfied by the same qualifying Natural weapon or weapon set. Ordinary acquisition routes continue to use their normal skill ranks. A substitution changes a known/available Technique's rolls and associated-skill scaling without granting skill training or access by itself. Consequently all available Martial Arts Techniques may use Metamorphosis, but this feature does not unlock higher-rank Martial Arts Techniques. No associatedSkill field is needed on the access grant.

Existing technique skill/tag grants retain their source-owned free-choice meaning. Existing tag on a technique choice remains a Technique classification filter; weaponTag is a weapon-context filter on the new access/substitution forms, not a new prerequisite type. Existing weapon prerequisite expressions remain unchanged.

## Native source changes

Canonical source: [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

- WeaponBases!A33:H40 adds Spiked Hide, Savage Claws, Extendable Limbs, Grasping Appendage, Web Shooters, Crushing Limbs, Grasping Fangs and Goring Horns. Each has Natural plus its authored weapon tags. Existing basic Technique keys are reused. Grasping Appendage has no invented basic attack; the two Reach N equations remain exact in traitsText and explicitly await evaluation support.
- Traits!I38,I39,I43,I54,I56,I59:I61 receives the corresponding weapon grants. H38,H39,H56 is cleared because those automatic attack relationships now belong to the bases. Spiked Hide retains its Spikes body-tag grant; other body tags are unchanged. Web's duplicate character-tag grant is replaced by its weapon relationship.
- Techniques!D143 changes Web Area from tag=Web to the existing weaponTag=Web selection route. Its other mechanics and all other Technique cells are preserved.
- ClassFeatures!G236,I236 contains the clearer Metamorphosis Techniques description and three grants above. All other ClassFeatures cells remain unchanged.
- Schema!G10,G36,G46,E99,G99,G104,G106; Enums!C15,C20,A56:C56; Metadata!B22 document the syntax, ownership, access/substitution composition and runtime deferral.

The batch changed 79 value cells and copied formatting only into the eight new base rows and one new enum row. Exact native readback verified all 91 planned values, neighboring values, validation and existing formatting. Evidence and the complete cell plan are ignored under `.staging/natural-weapons-source-2026-09-26/`.

Elemental Blaster and Integrated Weapon remain unchanged: the first supplies an element-dependent Technique rather than a defined fixed weapon-tag profile; the second selects an existing weapon base and needs an owned-weapon modification rule. Poisonous Skin's weapon-tag modification is also outside this fixed-base source migration. Their authored mechanics have not been replaced with invented profiles or grants.

## Display and execution boundaries

The shared Weapons catalogue and all six rank excerpts exclude an exact Natural tag while retaining the complete WeaponBases import. Trait and Technique catalogues keep their existing rules. The ordinary catalogue remains 31 bases; its formatted text matches the calculated cards and contains none of the eight Natural bases. Existing handbook Weapons links therefore keep the same content and bindings. The shared grant renderer presents new access/substitution rules and named weapon grants as readable text.

Parser/validator support accepts the new source syntax, checks references and ambiguity, preserves older v5 snapshots without the additive enum, and requires the enum when used. Technique access, substitutions, Trait-owned weapons, Natural-base acquisition and dynamic Reach remain explicitly deferred. The staged candidate must not replace the installed local/production data before shared runtime support exists: doing so would remove previously selectable Traits instead of fixing the builder.

The next WPE-DOMAIN-MIGRATION work implements derived weapons with provider ownership/rank/skill, separate acquisition and performance contexts, prerequisite matching and dependent-removal review, and consistent builder/sheet rendering. Ordinary equipment selection and slot/enhancement treatment must be handled deliberately. Publishing and production deployment remain separately authorized.

## Verification

- Preflight: 525 unit tests, ten-artifact production baseline and 15-page asset validation pass.
- Native source readback and visible weapon-row layout pass. All ten new live display fixtures pass, covering exact Natural filtering, rank-card alignment, access/substitution rendering, fixed weapon names, explicit missing references and compatibility of existing choice grants. Function_Tests has 96 passing checks and the one unrelated stale check noted below. Named weapon lookup uses the existing header-keyed WeaponBases import, not the compatibility helper's nonexistent _WeaponBases tab. All eight formatted tabs were refreshed.
- Full workspace checks pass 537 unit tests, 20 Firebase emulator tests and 15 HTML pages. After the final native weapon-name lookup repair, all 15 focused parser/display tests pass. The ten-artifact baseline and diff whitespace checks pass.
- Native snapshot stages ten deterministic artifacts in `.staging/game-data/runs/20260926T185926211Z-23064`, with zero errors, 135 warnings and successful runtime loading. The new mechanics' deferrals are expected warnings; no candidate is installed or published.
- Source modification time: `2026-09-26T18:54:14.114Z`; Drive version unavailable/null. Authenticated browser XLSX export acquired at `2026-09-26T18:59:25.121Z`, 585255 bytes, SHA-256 `d51abb8b0054d0ae64fb862da192ce8140ca27029e8c4b8b15ac9def75df9d9b`. Local ADC acquisition still lacks read-only Drive access; the stage used the separately validated native snapshot without claiming restored credentials.
- The unrelated Function_Tests row 3 still checks a retired authored class-status column and fails (0 versus 7). This source task changed no Classes values or class-display policy; the stale check is recorded rather than treated as evidence against Natural filtering.

Pre-existing instruction-consistency work remains separate from these changes. Production artifacts and the existing local candidate are unchanged.
