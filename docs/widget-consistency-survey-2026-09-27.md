# Widget consistency survey — September 27, 2026

The Keystone editors do not share one field component. Transformation Keystone uses a different widget and presentation from Origin, Background and Bond Keystones. Other choice types have substantial shared rendering, but field construction and interaction handling are still split across implementations.

This is an inspection of the current local workspace, including the existing uncommitted instruction-consistency changes. It records findings and recommended work; it does not change the UI, game data or saved characters, or complete `WPE-DOMAIN-MIGRATION` / `WPF-UI-SYSTEM`.

## Keystones

| Keystone | Current owner | Field and behavior |
| --- | --- | --- |
| Transformation and other feature-granted Keystones | `KeystoneChoiceWidget` | Three-row textarea, own card, and a second copy of the entered text under “Your Keystone.” Explicit inline error, busy state and focus restoration. |
| Origin Keystone | `OriginWidget` plus Origin-page HTML | Single-line input with help text; no duplicate preview. Own command/busy/focus handling. |
| Background Keystones | `BondsKeystonesWidget` plus Bonds-page HTML | Two single-line inputs, no duplicate previews. |
| Bond Keystone | `BondsKeystonesWidget` plus its row template | Single-line input within each Bond row, no duplicate preview. Rows are rebuilt after changes without the explicit replacement-field focus restoration used by the granted Keystone widget. |

That is three widget classes and four rendering paths. All enforce the same 400-character maximum and whitespace collapsing, but only the granted editor uses the shared `KEYSTONE_TEXT_LIMIT` constant. Their distinct commands and storage bindings are necessary: Origin, Background, Bond and source-owned grant answers have different owners. Different field markup and duplicate previews are not necessary to preserve that ownership.

Browser inspection of the disposable local Level 2 Metamorph confirms a 120px Transformation textarea versus 40px Origin, Background and Bond inputs. The Transformation text appears both in the editable field and immediately beneath it. The common `.input` class does not make these equivalent controls.

Evidence: [granted Keystone](../public/js/builder/widgets/keystone-choice-widget.js), [Origin widget](../public/js/builder/widgets/origin-widget.js), [Origin markup](../public/builder/builder-origin.html), [Bonds widget](../public/js/builder/widgets/bonds-keystones-widget.js), [Bonds markup](../public/builder/builder-bonds-keystones.html), [Keystone Rules](../public/js/core/keystone-rules.js).

## Other controls

| Family | What is shared now | Remaining difference or duplication |
| --- | --- | --- |
| Traits | The same `TraitWidget` serves Class, Feat and Origin grants, using shared Trait Rules and selected-result/rule-reference displays. | Its compact dropdown / expanded radio list, errors, busy state and focus restoration are implemented inside the Trait widget. |
| Feats | Active Class, archetype and other supported Feat grants use `FeatChoiceWidget`; grant filters differ intentionally. | It separately implements nearly the same compact/expanded picker interaction as Traits. Nested follow-up choices belong to the selected Feat and must remain there. |
| Granted Techniques, Weapons and Enhancements | Separate domain widgets all use `choice-catalogue.js` for compact/expanded browsing and `selected-choice-display.js` for the selected result. | This is a third implementation of the browsing pattern relative to Traits and Feats. Its toggle appears after the selected result, whereas Trait/Feat toggles sit beside the field heading. |
| Ordinary Equipment | `EquipmentWidget` also uses the shared catalogue and selected-result helpers for Add Weapon, weapon-base and Enhancement selectors. | It separately builds editable weapon/rank/name/Enhancement fields. These have legitimate equipment-management behavior, but their field primitives can be shared with grant controls. |
| Trait-granted Natural weapons | Equipment and the sheet share `weapon-grant-display.js` and the underlying weapon projection. | Read-only cards are intentional: the Trait owns these weapons. They should not acquire ordinary Equipment edit/remove controls. |
| Normal Technique catalogue | `TechniquesWidget` and granted Technique pickers share `renderTechniqueProfileHtml` and performance Rules. | Normal acquisition uses full-text checkbox cards grouped by rank/skill, rather than the single-choice picker. The multi-select difference is justified; checkbox labelling and disclosure presentation still need consistency work. |
| Class/Feat option groups | Both use `OptionGroupWidget`, including nested option groups. | Groups use a bespoke collapse button; Technique groups and referenced rules use native details/summary. Option-group headers set `aria-expanded` but do not associate it with a panel using `aria-controls`. |
| Class, Origin, Level, Primary Attribute | Common select styling and session commands. | Separate widget/HTML field assembly. Origin also owns its Keystone and granted-feature mounting. There is no common labelled-field/error/help component. |
| Attributes, Skills, Bond ranks, Equipment ranks | Domain-specific widgets consume their respective Rules and the shared session. | Numeric/select markup, rank-option formatting, busy handling and focus behavior are independently assembled. Share presentation; preserve the different legal ranges and ownership restrictions supplied by Rules. |
| Profile | Existing page form, save/navigation helpers and portrait controls. | It is page-managed, not a portable Profile widget. This is a wider form-consolidation task rather than another Keystone implementation. |
| Character sheet | Shared Technique/weapon renderers; non-Bond Keystones are collected into a common read-only list. | Bond Keystones remain inside Bond cards. Read-only display and sheet-owned temporary controls have different responsibilities from builder acquisition. |
| Consequence confirmation | All seven migrated builder pages use `CharacterSessionPage`, `confirmCharacterChange`, the shared impact summary and dialog lifecycle. | This is already shared behavior. Field-level error/busy/focus handling around it remains inconsistent. |

The older `FeatsWidget` creates `FeatWidget`, but no current builder page imports/mounts `FeatsWidget`. Those files are retained code, not evidence that users currently get a second active Feat picker. `GrantChoicesWidget` is a storage adapter with no visible control. `BoonWidget` is a registered read-only grant display; its existence does not establish a currently mounted catalogue choice.

Evidence: [Trait](../public/js/builder/widgets/trait-widget.js), [Feat](../public/js/builder/widgets/feat-choice-widget.js), [shared catalogue](../public/js/builder/widgets/choice-catalogue.js), [selected result](../public/js/builder/widgets/selected-choice-display.js), [rule disclosures](../public/js/builder/widgets/rule-details.js), [option groups](../public/js/builder/widgets/option-group-widget.js), [Equipment](../public/js/builder/widgets/equipment-widget.js), [Techniques](../public/js/builder/widgets/techniques-widget.js), [session coordinator](../public/js/builder/character-session-page.js), [shared dialog](../public/js/builder/builder-common.js).

## Concrete accessibility and lifecycle gaps

- Technique acquisition checkboxes have no associated label or accessible name. Browser DOM inspection confirms this for selectable Web Area, Piercing Shot and Slowing Shot, as well as read-only granted rows. A visible heading next to an input does not label that input.
- Bond name, rank and Keystone labels are visually adjacent but are neither wrapping labels nor connected by `for`/`id` or ARIA. This is confirmed on both rendered Bond rows in the local test character. Background Keystone labels are correctly connected.
- Focus restoration is explicitly handled by granted Keystones, Origin, Traits, Feats and the shared catalogue. Rebuilt Bond rows do not have the equivalent restoration. This is a source-verified gap; editing a Bond to reproduce lost focus was outside this read-only inspection.
- `BuilderWidget` provides registration, basic enable/disable and teardown. It does not render shared fields, errors or disclosures and does not standardize busy/focus handling. Several active widgets do not extend it. Merely making every class inherit it would not resolve the differences.

## Recommended implementation order

1. **One Keystone field component**, used by all four editors. Use the same textarea presentation for statements up to 400 characters, a connected label/help/error, and common busy/focus handling. Remove the redundant “Your Keystone” echo. Keep each owner's existing command, source identity and saved binding; this needs no character migration or Sheet edit.
2. **One compact/expanded choice component**, extending the existing catalogue helper so Traits and Feats can use it too. Preserve selected descriptions, nested Feat follow-ups and referenced-rule disclosures; keep one toggle location and common keyboard/focus behavior. Do not put interactive rule disclosures inside a clickable radio label.
3. **Shared labelled fields and selection rows**, starting with the confirmed Technique/Bond label defects, then rank controls and consistent inline errors/busy/focus behavior. Legal values remain domain Rules inputs, not arithmetic moved into a generic widget.
4. **Consistent disclosures and form integration**, including option groups and remaining page-managed forms, within `WPF-UI-SYSTEM`. Retire unused wrappers only after checking compatibility/tests; their deletion is not required to fix the active UI.

Use small shared components composed by the domain widgets. A universal widget would still need to distinguish single choice, multiple choices, free text, numeric allocation and read-only derived content, and would obscure their different ownership rules.

## Verification and boundary

- Preflight `npm test`: **545 tests passed**, zero failures; log `.staging/widget-survey-preflight.log`.
- Documentation handoff checks: **8 passed**. The ten-artifact production baseline, asset validation for **15 HTML files** and `git diff --check` pass.
- Read-only browser review at `http://localhost:5000` covers Class/Transformation, Origin, Bonds/Background and Techniques on disposable character `D87pCwT3H8XmhInZALx6`. A navigation save-warning dialog was cancelled; no field was edited or save accepted.
- Source inspection covers all current widget classes, builder page mounts, shared displays and the sheet's Keystone/weapon/Technique presentation. Browser findings above are distinguished from source-only findings; this was not a full keyboard, viewport or theme matrix.
- Existing unrelated working-tree changes are preserved. No runtime, canonical source, generated catalogue, stored character or production changes are part of this survey.

Remaining `WPE-DOMAIN-MIGRATION` acceptance/compatibility work still precedes the wider `WPF-UI-SYSTEM` step. The latter consolidates controls, accessibility, CSS ownership and navigation so the same interaction stays consistent across pages. This survey supplies its concrete targets; it does not mark either step complete. Production publication/deployment remain separate explicit instructions.
