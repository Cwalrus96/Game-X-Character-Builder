# Shared builder choices — September 27, 2026

The authorized follow-up makes choices for the same kind of entity use the same presentation and interaction, while preserving their source-specific commands and ownership. It addresses the [widget survey](widget-consistency-survey-2026-09-27.md) without replacing the builder's Rules, session, graph or persistence.

## Hierarchy and composition

```text
BuilderWidget
  InteractiveWidget
    CatalogueWidget
      TraitWidget
      FeatChoiceWidget
      EquipmentChoiceWidget
        EquipmentWidget
        WeaponChoiceWidget
        WeaponEnhancementChoiceWidget
      TechniqueCatalogueWidget
        TechniquesWidget
        TechniqueChoiceWidget
    TextChoiceWidget
      KeystoneWidget
        KeystoneChoiceWidget
```

`InteractiveWidget` centralizes pending/disabled state, errors, accepted-state rerendering, cancellation and replacement-widget focus. `CatalogueWidget` handles expansion, delegated selection and follow-up fields, rejecting stale, foreign, disabled and duplicate input. Domain subclasses inject Rules options, full descriptions and existing commands. Errors follow widgets recreated by a source refresh.

Catalogue widgets compose single/multiple variants of `ChoiceCatalogue`, plus domain cards, independent follow-up controls and referenced-rule components. Smaller `ChoiceField` text/select variants provide connected labels, help, errors, normalization and constraints. Equipment's Element follow-up is shared by ordinary and granted Enhancements. Text widgets compose `KeystoneField`; Origin and Bonds mount unregistered child Keystone widgets so composition does not create duplicate session owners.

## Result and intentional differences

- Transformation, Origin, Background, Bond and other granted Keystones share the same 400-character, three-row editor. The redundant granted-Keystone preview is removed.
- Traits, Feats, Techniques, Weapons and Enhancements share header/toggle placement, compact/expanded browsing and interaction lifecycle. Compact mode shows names/checkmarks; expanded options contain full rules once, with no repeated selected-description block. Referenced rules remain independently expandable outside clickable option labels.
- Normal Techniques keep multi-selection, now with accessible named checkboxes and compact/expanded descriptions. Granted single-choice Techniques use the same cards with a dropdown/radio selector. Expansion survives changes and cancellation.
- Equipment Add Weapon is a draft selection until Add is clicked; its rules are browsed through Expand. Owned and granted weapon/Enhancement selectors share the same controls. Rank, name and remove controls remain equipment-management responsibilities.
- Automatic Techniques and Trait-derived weapons retain their distinct read-only ownership. Feat-specific nested choices remain beneath their selected Feat. Class/Feat feature-option groups retain their existing shared widget and now connect disclosure buttons to their panels.
- Bond name/rank labels are connected. Keystone focus resolves the current field even when the enclosing Bond or feature is rebuilt. No character migration or source-data edit is required.

## Manual acceptance follow-up

The user accepted Keystone appearance and text limiting/saving, and confirmed Feat/Technique expansion. They requested that selection indicators suffice while collapsed, with rules available through Expand. This supersedes the earlier always-visible selected descriptions across all shared catalogue pickers. Required nested choices remain visible. Read-only selectors can expand without permitting edits. Other manual acceptance scenarios remain open.

Follow-up verification: preflight 554 units; final full workspace **555 unit tests, 20 emulator tests and 15-page asset validation**, all passing. Compact/expanded presentation, nonduplicate rules, independent Trait browsing, nested Feat/Enhancement inputs and read-only expansion are covered by 38 focused tests. Logs: `.staging/choice-detail-*`.

The isolated refinement passes **547 unit tests**, all **14 tracked-page asset checks**, the ten-artifact production baseline and whitespace checks. Local browser review verifies compact checked Techniques before/after acquisition, expanded full rules without a repeated footer, Feat compact/expanded selection, and Weapon Master's compact Weapon/Enhancement selectors with an editable Element field. Expanded weapon and Enhancement cards preserve the chosen Fire element. No browser edits were saved. Screenshot: `.staging/choice-detail-compact.png`. This refinement is local only; unrelated availability, prerequisite and source-document changes remain separate.

## Verification

### Individual Technique skill groups and partial acceptance

The user's further checks report working Tab navigation and mostly good layouts at different screen sizes. These are partial acceptance only, not a complete accessibility audit or every-screen/every-size signoff.

The Technique page previously grouped by a compatibility display string, creating separate categories such as Spellcasting versus Spellcasting/Psionics/Henshin Arts. The canonical data already provides parsed selection routes. A pure Technique Rules projection now evaluates each route through existing access/prerequisite Rules; the widget groups each rank under the qualifying individual skills. A Technique available through multiple skills appears in each matching group with one underlying key, synchronized checkmarks and one capacity/save entry. Skill summaries and search use those same parsed names. No parser, Sheet, schema, eligibility or roll-rule change is needed. Explicit access grants still qualify their authored skill groups; substitution alone grants no access. Tag/granted entries without a resolved skill label retain Other, and legacy single-skill records remain supported. Granted single-choice widgets and sheet cards have no skill-group headings to repair.

Preflight: **555 unit tests**, 15-page asset validation and the ten-artifact production baseline passed. Six controlled regressions cover every sampled skill direction, route order, missing compatibility text, unowned/under-ranked skills, incomplete records, prerequisites, aliases, access versus substitution, synchronized selection/removal and unique rank/capacity/save counts. Full workspace verification passes **561 units, 20 emulator tests and 15-page asset validation**. Logs: `.staging/technique-grouping-*`.

Local browser review on disposable Magical Guardian `AFUGLDoIOTjmNLRNLqu0` shows 18 Rank-1 Techniques in one Spellcasting group. Expanded cards verify both exclusive Bolstering Aegis and shared Charming Gaze, Magic Hand and Watercolor Illusion within that group. Selecting Charming Gaze checks its compact row and uses exactly one slot; the granted Telepathic Link remains free. These review edits were not saved. Screenshot: `.staging/technique-grouping.png`. The original user character, canonical Sheet and production remain unchanged. Wider manual acceptance and UI-system work remain open.

The isolated staged refinement passes **553 unit tests**, all **14 tracked-page asset checks**, the ten-artifact production baseline and whitespace checks. Unrelated Class/Origin availability, prerequisite and source-document edits are excluded from the feature commit. A separate pre-existing display finding remains: expanded cards list Rank-0 alternative rolls for untrained skills; that performance label is not used to decide catalogue groups and needs a later display/rules review.

- Preflight: 545 unit tests, 15-page asset validation and ten-artifact production baseline passed.
- Final full workspace `npm run test:all`: **554 unit tests, 20 emulator tests and 15-page asset validation**, zero failures. Controlled regressions cover shared row markup, accessible identifiers, all Keystone command bindings, disabled/stale/duplicate events, pending/rejected/replaced-widget behavior, cancellation/focus, teardown, and shared Enhancement detail updates.
- The isolated staged feature passes **546 unit tests**, all **14 tracked-page asset checks**, the ten-artifact production baseline and whitespace checks. The full workspace includes unrelated pre-existing tests and an ignored fixture page. The commit excludes unrelated Class/Origin availability changes, prerequisite/display corrections and source-contract work; required catalogue helpers and awaited grant callbacks are included with their new callers.
- Local browser checks on disposable character `D87pCwT3H8XmhInZALx6`: matching Keystone editors; Trait cancellation restores Web Shooters and focus; Feat acquisition; ordinary Add Weapon preview/add; Weapon Master's weapon/Enhancement selection and Element=Fire retention; ordinary Piercing Shot acquisition; Dazzling Wand's granted Healing Light and selected rules; Background Keystone save/reload and restoration. Original character `OkolV60rpCO07Awul9ua` was not edited.
- Logs and screenshot evidence live under ignored `.staging/widget-consistency-*`. Local Firebase Hosting remains active at `http://localhost:5000`; no production deployment, canonical Sheet edit or generated-data publication occurred.
- Browser review covered the current desktop viewport. A requested temporary viewport override was not applied by the browser provider, so this pass makes no new narrow-viewport or full-theme-matrix claim.

## Remaining boundary

This completes the requested builder-choice consistency pass, not the entire `WPF-UI-SYSTEM` roadmap step. General rank/allocation fields, Profile form decomposition, broader CSS ownership, app-wide save/navigation and sheet decomposition remain separate work. Their benefit is consistent behavior across the rest of the application after remaining `WPE-DOMAIN-MIGRATION` acceptance. They must preserve the established Rules/session boundaries; production publishing/deployment still requires explicit instruction. Unrelated instruction-consistency and game-data work predating this task is preserved outside this feature commit.
