# Architecture and source-data audit

**Date:** 2026-08-02  
**Status:** Review baseline and proposed remediation plan  
**Scope:** Website architecture, builder state, dependency graph, persistence, rules, UI/CSS, accessibility, security boundaries, tests, documentation, deployment hygiene, the Google Drive handbook, and the two primary Google Sheets workbooks.

## Review method and limitations

This is a source-backed static review of the current working tree, including the uncommitted dependency-graph refactor. The Google Drive sources were inspected read-only and were not changed. The main Drive sources reviewed were:

- [Player Handbook](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit)
- [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit)
- [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit)

The review also compared those sources with the generated data under [public/data/game-x](../public/data/game-x/) and the exporter at [scripts/export-game-data.mjs](../scripts/export-game-data.mjs).

Runtime tests and a browser walkthrough were not rerun during this pass because a usable Node/browser runtime was unavailable in the review environment. Findings that depend on behavior are therefore tied to explicit control flow in the source, existing tests, or direct workbook inspection. They should be converted into automated regression tests before fixes are merged.

## Executive assessment

The project is recoverable without a rewrite. It already contains several of the right seams: a central dependency module, a generic builder-page coordinator, canonical choice helpers, shared capacity logic, database reader/writer modules, rule tests, and a data-driven game-data export. The Dazzling Wand/source-owned technique work is a useful vertical proof that the intended model can work.

The central problem is that the application currently contains **three overlapping builder architectures**:

1. page-owned state and validation,
2. widget-owned state and mutation,
3. partially graph-backed state and reconciliation.

None is yet the sole authority. The graph is rebuilt for isolated previews and does not model the whole character, while several pages and widgets continue to mutate or validate independently. That makes behavior dependent on which page initiated a change.

There is an equivalent split in the data pipeline. The live source workbook, exporter input assumptions, generated JSON, runtime readers, display workbook, and handbook do not currently share one enforceable contract. A fresh export from the current workbook would not reliably reproduce the checked-in game data.

The recommended strategy is:

- stabilize destructive/save/preview behavior first;
- establish versioned character-state and game-data contracts;
- introduce a real in-memory CharacterSession and graph compiler;
- migrate one domain at a time behind those contracts;
- consolidate UI primitives and CSS after state ownership is stable;
- make CI, source validation, migrations, and documentation release gates.

This should be a sequence of bounded changes, not a simultaneous rewrite.

## Stop-the-line findings

These issues should be resolved, or explicitly guarded, before expanding the graph to more choice types.

| ID | Priority | Finding | Consequence |
|---|---|---|---|
| ST-1 | P0 | The live source workbook and exporter disagree on multiple column names, grant types, and prerequisite shapes. | A fresh export can silently omit or corrupt data. |
| ST-2 | P0 | The character sheet writes permanent builder fields from a stale, once-read document snapshot. | A sheet tab can overwrite newer class, level, attribute, or equipment work from another tab. |
| ST-3 | P0 | Preview warnings can apply silently when no confirmation handler exists, and errors can be confirmable. | Invalid or destructive state can be committed despite the preview contract. |
| ST-4 | P0 | Class changes clear dependent state before graph reconciliation. | The graph cannot report the removed dependent answers it was meant to protect. |
| ST-5 | P0 | Source-owned weapons are materialized into normal equipment state without a graph-owned lifecycle. | A user can edit/remove a grant result independently of its source, leaving inconsistent state. |
| ST-6 | P0 | Several data-derived strings enter innerHTML through a helper that does not escape HTML. CSP is report-only and has no reporting endpoint. | Source data can become executable markup; the current CSP neither blocks it nor reliably surfaces it. |
| ST-7 | P0 | The Attributes page and shared dialog service can create duplicate modal control IDs. | A confirmation can bind to hidden controls and leave the visible dialog unresolved. |
| ST-8 | P0 | Global navigation and tab close do not consistently flush or guard dirty state; sheet save failures are console-only. | User work can be lost without a visible error. |
| ST-9 | P0 operational | A service-account credential is stored inside an ignored administration folder in the repository tree. | It is easy to copy, back up, or publish privileged credentials accidentally. |

For ST-1, freeze fresh production exports until the source/export/runtime contract is reconciled and an export diff is reviewed. For ST-9, keep credentials outside the repository tree, use Application Default Credentials or an explicit external path, and rotate the key if it has ever been copied or shared. This review intentionally did not inspect the credential contents.

## Current architecture

The intended architecture and the effective runtime architecture are different.

~~~mermaid
flowchart TD
    Drive[Drive handbook and source workbooks] --> Exporter[export-game-data.mjs]
    Exporter --> JSON[Checked-in game-data JSON]
    JSON --> GameData[game-data.js]

    Firestore[(Firestore character)] --> Reader[database-reader.js]
    Reader --> PageState[Per-page currentDoc / local draft]
    GameData --> Pages[Builder pages]
    GameData --> Widgets[Widgets]

    PageState --> Pages
    Pages --> DirectRules[Page-local validation and capacity]
    Widgets --> WidgetRules[Widget-local validation and mutation]
    Pages --> BuilderPage[builder-page.js on some pages]
    BuilderPage --> Dependencies[builder-dependencies.js]
    Dependencies --> Graph[character-dependency-graph.js]

    Pages --> Writer[database-writer.js]
    Widgets --> PageState
    Graph --> Patch[Reconciled patch]
    Patch --> Writer
    Writer --> Firestore

    Firestore --> Sheet[character-sheet.js]
    Sheet --> Firestore
~~~

The graph is one participant in this flow rather than the authority over it. Attributes, Origin, Skills, Equipment, and much of the character sheet retain independent interpretations of what is legal and what should be persisted.

### Architectural strengths to preserve

- [character-dependency-graph.js](../public/js/core/character-dependency-graph.js) and [builder-dependencies.js](../public/js/core/builder-dependencies.js) create a shared place to move dependency logic.
- [builder-page.js](../public/js/builder/builder-page.js) establishes a promising command/preview/apply boundary.
- [choice-capacity.js](../public/js/core/choice-capacity.js) and [choice-identity.js](../public/js/core/choice-identity.js) are correctly aimed at cross-page rules and stable choice ownership.
- The grant factory/widget direction is more extensible than hard-coding each feature on a page.
- The source-owned technique-choice behavior demonstrates source-to-answer tracking in one important slice.
- Firebase access-control and storage rules already have emulator tests.
- The source workbook currently has no observed duplicate canonical class, feature, feat, or origin IDs, and the checked foreign-key relationships resolved in the reviewed ranges.
- The application remains deployable as a relatively simple static Firebase site; there is no need to add a large framework solely to complete this architecture.

## Detailed findings

### 1. Character state has no single in-memory owner

The desired unit is a complete character session made from:

- a persisted baseline;
- current accepted but unsaved edits;
- one proposed command;
- a reconciled result and structured impact report.

The current application instead keeps page-specific copies such as currentDoc, widget-local selections, direct GrantChoiceState mutations, and ad hoc proposed builders. [builder-page.js](../public/js/builder/builder-page.js) coordinates only Class and Techniques. Other pages invoke refresh helpers directly or implement their own lifecycle.

Consequences:

- navigation changes the interpretation of the same character;
- a preview can compare against a draft that has already discarded the old dependency;
- accepted in-memory state can differ from the patch eventually written;
- cross-page unsaved choices cannot all participate in one graph;
- tests must reproduce page orchestration rather than exercising a domain command.

Recommendation: add a long-lived CharacterSession that owns persisted, working, and proposed state. Pages receive projections and send typed commands; they do not own character truth.

### 2. The dependency graph is a reconciliation pipeline, not yet a dependency graph

[character-dependency-graph.js](../public/js/core/character-dependency-graph.js) constructs node, edge, and reverse-edge collections, but reconciliation does not traverse those edges to determine the affected subgraph. Grants and prerequisites remain mostly properties interpreted by ordered procedural passes.

The modeled nodes cover only part of the character:

- class and level;
- class-feature options;
- feats;
- grant sources and grant answers;
- techniques.

Important missing domains include:

- attributes and primary attribute;
- origin and origin-feature choices;
- skills;
- weapon bases, enhancements, and generated weapons;
- bonds and keystones;
- profile choices;
- automatic abilities and other derived state.

This means the graph cannot yet answer the core questions for the entire character: what exists, why it exists, what storage represents it, what depends on it, and what a removal invalidates.

Recommendation: separate graph compilation from reconciliation. Compile every meaningful choice into a typed node and typed edges, then calculate the impacted closure from the proposed command. Reconcile to a fixed point when one removal can invalidate another choice.

### 3. Preview and apply do not enforce a safe contract

In [builder-page.js](../public/js/builder/builder-page.js), a preview with warnings can proceed when no confirmation callback is supplied. A supplied callback can also approve a preview containing errors. The Class page's confirmation path summarizes removals but does not establish errors as non-confirmable.

There is also a state mismatch: dependency refresh fields may be included in the returned save patch without being reflected in the reconciled in-memory builder. The user can therefore confirm one representation while the writer receives another.

The contract should be:

1. apply a typed command to a copy of working state;
2. compile/analyze/reconcile entirely in memory;
3. produce one reconciled state, one canonical patch, and one structured impact report;
4. block on any error;
5. require confirmation for configured warning classes;
6. commit the same reconciled state that produced the patch;
7. persist it through one repository boundary.

Warnings should never be parsed or filtered as strings. They should carry codes, source node IDs, affected node IDs, display labels, severity, and whether they are confirmable.

### 4. Pre-reconciliation deletion defeats dependency reporting

[builder-class.js](../public/js/builder/builder-class.js) clears selected options, feats, and grant choices when the class changes before the graph sees the old and proposed states. That makes it impossible for the graph to discover and summarize the full dependent closure. It is directly contrary to the Dazzling Wand requirement: removal of the source must be what causes removal of its chosen technique.

Recommendation: a page command should express only the user's direct intent, such as SetClass. All dependent removal must be calculated by the graph from the old and proposed graphs.

### 5. Source-owned choices are only partially modeled

Source-owned techniques are excluded from normal technique capacity and have an identity helper, but the pattern is not generic yet. [grant-widget-factory.js](../public/js/builder/widgets/grant-widget-factory.js) and related widgets can mutate grant-choice state directly. Generated weapons are denormalized into builder.weapons, where [builder-equipment.js](../public/js/builder/builder-equipment.js) can treat them like ordinary editable equipment.

Every grant-created answer needs:

- a stable source node;
- a stable choice-definition node;
- a stable answer node;
- an ownership edge;
- a storage binding;
- a materialization rule if it projects into another collection;
- capacity policy, including whether it consumes a normal slot.

The materialized weapon is a view or derived result of the answer, not an independent user-owned weapon. Editing or deleting it must route back through the source-owned answer command.

### 6. Rules are duplicated and not consistently pure

[character-rules.js](../public/js/core/character-rules.js) presents itself as a rules layer but imports game-data loading, performs asynchronous hit-point lookup, and produces HTML option markup. Rules therefore mix domain policy, data access, and presentation.

Examples of duplicated policy include:

- feat-slot calculation in both the Class page and graph;
- technique capacity and eligibility across the graph, TechniquesWidget, TechniqueChoiceWidget, and character sheet;
- attribute pruning on the Attributes page;
- skill-cap inference via regular expressions over descriptive prose;
- progression and skill-data repairs inside [game-data.js](../public/js/core/game-data.js).

Recommendation:

- Pure Rules functions accept normalized character state and normalized game data, and return values or structured violations.
- Rules must not fetch, inspect DOM, return HTML, or parse descriptive text to discover mechanics.
- Widgets and the graph may depend on Rules.
- Rules must not depend on widgets, pages, Firebase, or live loaders.
- Capacity, expected-selection count, eligibility, and prerequisites each need one canonical implementation.

### 7. Adding a choice type still requires edits across the application

A new type such as Boons currently implies changes to exporter allowlists, runtime grant allowlists, choice-creating type sets, grant-choice sanitizers, graph projections, graph reconciliation, and the widget factory.

Recommendation: introduce registries with explicit adapters:

- GrantTypeRegistry: validate and instantiate each grant type;
- ChoiceTypeRegistry: normalize answer state, capacity policy, and storage binding;
- NodeFactoryRegistry: compile game-data/state records to graph nodes;
- WidgetRegistry: render/edit a supported choice type;
- MigrationRegistry: update persisted representations.

The extensibility acceptance test is that adding Boons should require a data-contract entry, a rules/grant adapter, and a widget. It should not require edits to individual builder pages or the graph traversal engine.

### 8. Persistence boundaries are porous

[database-reader.js](../public/js/core/database-reader.js) imports the writer to obtain a schema constant, while the writer combines field codecs, schema filtering, and Firebase browser I/O. [characters.js](../public/js/pages/characters.js) and [character-sheet.js](../public/js/pages/character-sheet.js) also perform direct Firestore writes.

Recommendation:

- CharacterCodec: pure decode/encode and defaults;
- CharacterMigrations: pure sequential version migrations;
- CharacterRepository: the only Firestore read/write boundary;
- CharacterSession: state ownership and save coordination;
- GameDataRepository: fetch, validate, cache, and return immutable normalized game data;
- StorageRepository: portrait/object operations.

UI modules should not import Firebase SDK APIs.

### 9. Migration infrastructure is absent

The reader fills defaults but explicitly provides no legacy support, can retain an old schemaVersion, and contains no sequential migration registry. Legacy grant-choice identity repair is embedded in graph behavior. The current writer does not guarantee that every save stamps the current character schema version.

The character schema is currently version 4, while the sheet also uses an unrelated internal state version 3. Those are not clearly named or documented, making accidental comparison likely.

Recommendation:

- use distinct constants such as CHARACTER_SCHEMA_VERSION and SHEET_STATE_VERSION;
- decode raw data without trusting its shape;
- run migrateV1ToV2, migrateV2ToV3, and so on;
- validate the migrated state;
- make migration idempotence and fixtures part of CI;
- persist the current version on every successful canonical write;
- keep migration logic out of graph reconciliation.

Stable IDs will probably justify a schema version 5 rather than another set of runtime aliases.

### 10. The write schema gate is open-ended

[database-writer.js](../public/js/core/database-writer.js) allows any path beginning with builder even when it is not a recognized field. Only known exact paths receive targeted sanitization. A typo or obsolete property can therefore be written to Firestore indefinitely.

Recommendation: encode a complete canonical builder object or validate patches against an exact versioned path schema. Reject unknown fields in development/tests and log a migration-specific diagnostic for legacy fields.

### 11. Persisted identity is often presentation-based

Several persisted keys are derived from class names, level, group names, option names, feat names, technique names, source labels, or row position. Renaming text or reordering source rows can orphan saved answers.

Required durable identifiers include:

- classKey;
- classFeatureKey;
- optionGroupKey;
- optionKey;
- featKey;
- techniqueKey;
- originKey and originFeatureKey;
- weaponBaseKey, weaponProfileKey, and enhancementKey;
- choiceId for every choice-creating grant;
- source node IDs derived from stable IDs, never display labels.

Aliases are appropriate for bounded migrations, not as the permanent identity system.

### 12. Character-sheet saving can overwrite newer builder data

[character-sheet.js](../public/js/pages/character-sheet.js) loads a document snapshot and later autosaves permanent builder fields such as name, portrait, level, attributes, class, primary attribute, and weapons alongside sheet-local fields. If another tab changes the builder after the sheet snapshot was read, the next sheet save can write the stale values back.

Save failures are logged to the console but are not surfaced as persistent UI errors.

Recommendation:

- make permanent builder fields read-only projections on the sheet;
- autosave only a dedicated sheet-owned subtree such as builder.sheet;
- route portrait changes through a dedicated command/repository operation;
- use update preconditions or transactions where concurrency matters;
- display saving, saved, offline, retrying, and failed states;
- flush or warn on navigation/unload;
- add a two-tab lost-update integration test.

### 13. Firestore rules protect access, not document integrity

The Firestore rules primarily establish ownership/access. They do not constrain character document types, schema-version bounds, allowed fields, size, or owner immutability. A legacy character path remains writable. Storage rules are comparatively well bounded.

Recommendation: after the canonical character schema is defined, add rules for:

- owner identity and immutability;
- allowed top-level fields;
- schema-version bounds;
- bounded strings and collection sizes;
- allowed write locations;
- retirement or explicit migration of the legacy path.

Client validation remains important, but rules should reject malformed or unexpectedly broad writes.

### 14. HTML escaping and CSP need a coherent trust model

A helper named sanitizeText does not actually HTML-escape. Data-derived class names, feature names/descriptions, option-group labels, and other content are interpolated into innerHTML in modules including:

- [class-features-widget.js](../public/js/builder/widgets/class-features-widget.js)
- [builder-class.js](../public/js/builder/builder-class.js)
- [option-group-widget.js](../public/js/builder/widgets/option-group-widget.js)

The generic modal accepts raw message HTML. Current callers may wrap some warning text safely, but the API itself makes unsafe use easy. The Content Security Policy is report-only and has no configured reporting endpoint.

Recommendation:

- use textContent and DOM construction for untrusted text;
- provide one correctly named escapeHtml helper only where markup construction is unavoidable;
- accept structured dialog content rather than arbitrary HTML;
- remove inline style dependencies as CSS is consolidated;
- deploy a tested enforcing CSP in stages;
- add a real report endpoint during report-only rollout.

### 15. The shared confirmation dialog is internally inconsistent

[builder-attributes.html](../public/builder/builder-attributes.html) contains a confirmOverlay with child control IDs also used by the shared modal service in [builder-common.js](../public/js/builder/builder-common.js). The service looks for a different outer ID and can create a second dialog with duplicate child IDs. Global ID lookup can then bind the hidden instance rather than the visible one.

Recommendation: create one DialogService, one dialog root, scoped element lookup, focus trapping, focus restoration, inert/background handling, Escape behavior, and a promise lifecycle that cannot remain unresolved. Use the same service for delete confirmation rather than window.prompt.

### 16. Save and dirty-state behavior is not app-wide

Builder-step navigation can invoke a local before-navigation hook, but global Characters/Profile links are normal anchors. Tab close, refresh, and history navigation are not consistently guarded. The sheet's debounced save is flushed for only some navigation paths. Save buttons are not uniformly serialized or disabled, so overlapping writes can race.

Recommendation: a shared SaveCoordinator should expose:

- clean, dirty, validating, saving, saved, and failed states;
- one in-flight save per character/session;
- queued/coalesced later patches;
- flush-before-navigation;
- beforeunload protection while dirty or saving;
- persistent retry/error UI;
- page-independent navigation guards.

### 17. CSS has no reliable ownership model

[styles.css](../public/css/styles.css) is loaded broadly but contains character-sheet themes, skills, weapons, print rules, global body/table/textarea styling, and other route-specific rules. Builder styles then redefine many of the same primitives. site-core, builder-core, and builder CSS repeat tokens and backdrop patterns. Route styles import shared styles redundantly and increasingly rely on !important.

Generic selectors such as .btn, .card, .error, .muted, and .input have different meanings on different routes. A global mobile table rule can alter the GM users table, and global print rules affect pages other than the sheet.

Recommended CSS ownership:

- tokens.css: color, spacing, typography, radii, elevation, motion;
- base.css: reset and semantic element defaults;
- app-shell.css: global navigation, page shell, landmarks;
- components.css: buttons, fields, alerts, dialogs, cards, badges, toolbars;
- builder.css: builder layout and explicitly prefixed builder components;
- character-sheet.css, characters.css, gm.css, and profile.css: route-local rules;
- print rules only in the route that owns them.

Use component variants or namespaced classes instead of redefining the same generic selector. Cascade layers can make the transition safer.

### 18. Shared UI behavior is still duplicated

Only Class and Techniques use BuilderPage. The other builder pages repeat combinations of:

- authentication/bootstrap;
- current-document loading;
- status and error display;
- save and navigation;
- dependency refresh;
- visibility toggling;
- local escaping/markup;
- dirty-state behavior.

The app shell is also constructed and then reconstructed during auth initialization, clearing DOM unnecessarily.

Recommended shared primitives:

- AppShell;
- BuilderStepController;
- StatusRegion;
- DialogService;
- FormField;
- ChoiceGroup and ChoiceRow;
- SaveActions;
- RepeatableCollection;
- Card, Alert, Badge, EmptyState, and Toolbar;
- SheetSection.

These should share behavior and accessibility, not just visual CSS.

### 19. Accessibility is not a system requirement yet

The reviewed pages contain no semantic forms, live status regions, alert/status roles, consistent aria-invalid/error associations, or predictable Enter-key submit behavior. Several generated inputs lack associated labels:

- six Attribute inputs;
- technique checkboxes;
- technique/weapon/enhancement grant-widget controls;
- repeated bond inputs.

The Attribute layout uses incomplete custom table ARIA rather than a native table or a complete grid pattern. The modal lacks a label, focus trap, focus restoration, and background inertness. Characters, GM, and character-sheet pages lack consistent main/h1 landmarks. A sheet skip link can target a field hidden in ownership mode.

Recommendation: make accessibility part of each UI primitive's contract. Add automated axe checks plus keyboard-only and screen-reader smoke scenarios.

### 20. Character sheet is an oversized subsystem

[character-sheet.js](../public/js/pages/character-sheet.js) is roughly 1,900 lines and combines:

- Firestore lifecycle;
- save/autosave state;
- character-state adaptation;
- game calculations;
- section rendering;
- repeatable controls;
- ownership mode;
- tooltips;
- portrait operations.

Recommendation: first make writes safe, then split the module into a sheet controller/session adapter, save coordinator, pure view model/calculations, section renderers, repeatable-field utility, and tooltip/presentation modules. Avoid refactoring it before the stale-write behavior is covered by tests.

### 21. Route-level finish and consistency are uneven

Examples:

- [public/index.html](../public/index.html) points to styles.css even though the stylesheet is under css;
- [public/404.html](../public/404.html) remains a default Firebase template;
- favicon coverage is inconsistent;
- some pages lack h1/main structure;
- the Profile page has an unused builder navigation mount;
- step labels and Save/Open actions vary by page;
- disabled Campaigns navigation is communicated only through a title tooltip;
- sheet tooltips still describe fields as editable after they became read-only.

These are lower risk than state loss, but they make the product feel like several applications and complicate support.

### 22. There is no general quality gate

The repository has focused Firebase rules tests and a graph test, but no single test command, CI workflow, linting, formatting, type checking, browser smoke suite, accessibility checks, or visual/responsive tests. Core graph files are currently untracked in the working tree, and the branch contains multiple local commits and extensive uncommitted changes.

The package configuration does not establish one module mode, producing avoidable Node module warnings in prior test runs. HTML, CSS, JavaScript, and README files have mixed line endings. There is no .editorconfig or .gitattributes policy.

Recommendation:

- make a named checkpoint of the current refactor before broad cleanup;
- add test, test:unit, test:rules, test:integration, lint, format:check, and validate:data commands;
- add CI on pull requests;
- add .editorconfig and .gitattributes after the dirty tree is checkpointed;
- keep formatting-only changes separate from behavior changes;
- add a module-mode decision explicitly to package configuration.

### 23. Administration code and credentials lack a safe operational boundary

The entire adminScripts directory is ignored, including operational source and package metadata, while it also contains a service-account file. The result is the worst combination: the procedure is not reviewable/versioned, but the credential still lives under the project directory.

Recommendation:

- move reusable admin code into a tracked scripts/admin area;
- document invocation and required roles;
- use external credentials or ADC;
- retain generated logs/exports outside version control;
- add a deploy/release checklist and least-privilege guidance.

## Source-data and spreadsheet audit

### 24. There is no declared authority for each kind of game data

Four representations have drifted:

1. the Player Handbook, modified 2026-08-02;
2. game-x-class-data, modified 2026-07-31;
3. Game-X-Data-Display, containing both derived and manually maintained data;
4. checked-in XLSX/JSON release artifacts last exported on 2026-06-29.

The newest item is not always the most correct item. The handbook has stronger class prose in some places but stale or duplicated origin content in others. The source sheet is more structured but contains partial classes, TODO content, and schema mismatches. The display workbook mixes generated views with manual copies.

Recommendation: declare authority per domain, not merely per file. For example:

| Domain | Proposed authority | Derived views |
|---|---|---|
| Mechanical IDs, prerequisites, grants, counts | Structured source workbook | JSON, display workbook, website |
| Player-facing canonical prose | Structured source rows with handbook anchor, or handbook if explicitly chosen | Website and display workbook |
| Editorial notes and rationale | Handbook/design notes | Optional links from source |
| Release-ready status | Structured source workbook | Export report and CI |
| Runtime character schema | Versioned code contract | Firestore documents |

Every released record should expose a stable ID, status, source anchor, and last-reviewed revision.

### 25. The live workbook is incompatible with the current exporter

Observed examples:

- Feats uses category, rowType, and prerequisites where the exporter expects featType, classKey, minLevel, and review-oriented fields.
- OriginFeatures uses name, description, level, and rowType where the exporter expects featureName, featureText, and featureOrder. Under the current assumptions, all 23 reviewed origin-feature rows can be skipped.
- The workbook uses questions where the exporter reads roleplayQuestionsText.
- Live grants include resource and familiar, which the exporter allowlist rejects.
- Structured prerequisite and grant fields such as classKey, featKey, minCount, level, and tag do not match the exporter allowlists.
- energyCost values such as "0 or 3" and "N" cannot be represented safely by the current numeric parser.
- The exporter emits schemaVersion 1 without source workbook ID, source revision, export time, or content hash.

Dazzling Wand currently works because the exporter applies an undocumented conversion from a technique grant with a skill parameter into a technique-choice grant. The checked-in JSON contains the converted shape, but the source README does not define this behavior.

Do not run a production export until this contract is reconciled and a full before/after artifact diff has been reviewed.

### 26. Exporter validation does not protect referential or semantic integrity

The exporter/runtime contract is duplicated rather than shared. Validation does not reliably prove:

- ClassFeature.classKey belongs to a real class;
- grant and prerequisite types are supported by the runtime;
- every choice-creating grant has a stable choiceId;
- expected selection counts are present and valid;
- source-owned answers have a storage contract;
- techniques have stable IDs;
- generated IDs do not collide;
- all release-ready content is complete.

The checked-in generated data already exposes warning signs:

- an invalid class-feature bucket/key named "5";
- a bogus first feat record with featKey "feat" and an empty name;
- prerequisite diagnostics with Feat and Technique contexts crossed;
- free-text prerequisites that become permissive manual/text checks;
- unresolved choice prerequisites that can be broadly deferred.

The export must fail closed for release-ready rows and report draft rows separately.

### 27. The source workbook needs a normalized authoring contract

The reviewed workbook has these tabs and populated row counts:

| Tab | Populated records observed |
|---|---:|
| Classes | 19 |
| ClassFeatures | 73 |
| Techniques | 85 |
| Feats | 38 |
| Origins | 15 |
| OriginFeatures | 23 |
| WeaponBases | 31 |
| WeaponProfiles | 33 |
| WeaponEnhancements | 31 |

The sheets use default 1,000-row grids, inconsistent freeze settings, almost no data validation, no cell notes, and no formulas in the source tables. In the reviewed populated ranges, Origins status was the only meaningful dropdown validation. Keys use mixed conventions: kebab case for some domains, snake case for weapons, and display-name identity for Techniques.

Recommended workbook structure:

- README: exact release workflow and ownership;
- Schema: field names, types, nullability, examples, and exporter mapping;
- Enums: one source for status, grant type, prerequisite type, tag, and category values;
- Classes, Features, Feats, Techniques, Origins, Weapons, and other entity tables;
- Grants: one row per grant with grantId, sourceType, sourceKey, grantType, targetKey, count, choiceId, and parameters;
- Prerequisites: one row per requirement with prerequisiteId, ownerType, ownerKey, requirementType, targetKey, operator, and value;
- OptionGroups and Options: explicit stable group/option rows instead of adjacency conventions;
- Validation: formula/query views for duplicates, unresolved keys, missing release fields, invalid enums, and choice ownership;
- Release: a filtered manifest of records eligible for export.

Prefer normalized child rows for grants and prerequisites over newline/comma-encoded mini-languages. If a compact authoring syntax remains, it still needs one formal grammar, parser tests, and round-trip fixtures.

### 28. Choice ownership is incomplete in source data

Examples found during the source review:

- Heroic Combat Training has insufficient class/level ownership information and can be skipped by export.
- Shining Weapon is a nested option group while the source README describes flat adjacency.
- Shining Weapon and Monster Evolution/Collection omit an explicit chooseCount.
- OriginFeature grant cells are blank even where prose describes choices, including Bonded Relic Rank 2, Living Archive's three skills, Flexible Gadgets, and Powerful Patron's bond.
- Weaponsmith's enhancement choice lacks an explicit choiceId/reference.
- Soulbound encodes multi-line grants with choice identity embedded indirectly.

Every prose phrase equivalent to "choose", "select", "gain one of", or "replace" should be backed by a structured choice record with ownership, count, eligibility, and storage.

### 29. Content readiness is not machine-readable

The source material mixes playable content, design notes, placeholders, and skeletal records:

- about seven of nineteen class rows appear substantially playable;
- Elementalist, Mech, and Psychic are partial;
- nine classes are skeletal;
- one Magical Guardian design note is copied into multiple unrelated class rows;
- level-up guidance contains repeated prose and TBD text;
- a Magical Guardian level-4 record encodes a level-2 grant;
- 21 technique rows contain TODO/TBD markers;
- 6 technique rows lack descriptions;
- 60 of 85 technique rows lack source notes;
- strainCost is blank across the reviewed technique rows;
- 13 weapon bases lack profiles and mostly lack tags;
- eight enhancements expose draft/typo state only through notes rather than a status field.

Origins already demonstrate a useful status pattern. Apply a required status enum to every exportable entity: draft, review, ready, deprecated. Production export should include only ready records unless an explicit preview build is requested.

### 30. The display workbook is neither a pure view nor an authority

Game-X-Data-Display contains 19 tabs, many expanded to 1,000 by 300 cells. Some class/feat/technique/origin views depend on hidden imports, while weapon tabs contain manual copies.

Observed drift includes:

- 11 WeaponBases tag-cell differences from the source workbook;
- a missing soulbound enhancement;
- 28 WeaponEnhancement prerequisite-cell differences;
- custom functions such as DATA_IMPORT_SHEET, CLASS_LEVEL_BLOCK, FEAT_MATRIX, TECHNIQUES_CATALOGUE, and ORIGIN_BLOCK that are undocumented and not versioned in the repository;
- a Function_Tests sheet with only two formulas and no expected value, assertion, or pass/fail result;
- visible pages showing only one class, four Ninja feats, fifteen Henshin techniques, and one origin, without explaining whether this is a preview or the catalog;
- malformed formatted strings and empty Grants labels.

Choose one of two models:

1. **Generated display:** every visible cell is derived from the canonical source/release artifact, custom-function source is versioned, and tests assert expected output.
2. **Retired display:** the website becomes the preview, and the workbook is archived read-only.

Do not retain a mixed model with manually copied mechanics.

### 31. Handbook and workbook discrepancies need an editorial workflow

Examples:

- the handbook contains unique class notes where the workbook repeats Magical Guardian text;
- Mech Pilot rules appear in the handbook but not the structured sheet;
- the handbook's Slimefolk text duplicates Powerful Patron, while the workbook's Slimefolk text is coherent;
- Sentinel Style describes Reach 2+ in the handbook but only a generic reach tag in the sheet;
- Spread Volley shape differs;
- a source note says Class Skill while the structured field says Spellcasting.

These should not be fixed ad hoc in one representation. Add discrepancy records with owner, chosen resolution, source anchor, and review date.

### 32. Duplicate and transitional Drive workbooks need lifecycle labels

The Drive contains multiple apparent staging/copy workbooks, including:

- [grants-columns](https://docs.google.com/spreadsheets/d/1cE2On41sryxSv-88gyrOFu0ncqq53JNC6Kb_aEQr4JU/edit)
- [feats-cleaned](https://docs.google.com/spreadsheets/d/1IemyRXQib_2UNB0eYjU3AHJ3ntcrOCxEl-Pkma6T7s0/edit)
- [origins copy A](https://docs.google.com/spreadsheets/d/14wfQnbBdrI9ZsQey3CRI1yoymIFCWJBWHA8kfWba0sw/edit)
- [origins copy B](https://docs.google.com/spreadsheets/d/18bh9AFonDGLrbq7zBWugHUej6aVor7kIIVXPwlRipyQ/edit)
- [v2 workbook](https://docs.google.com/spreadsheets/d/11iO-xfpwvLXYqtU0xbI3bdyCJxEMnslXQwpBIuU6Zsc/edit)
- [weapons_combined](https://docs.google.com/spreadsheets/d/1EpHvJry1sJQYhD-d3aGmoZo_mB60OWirIW3dOInE_K0/edit)
- [import tabs](https://docs.google.com/spreadsheets/d/1nn4k2HKG4rGd8Pz6dPEA74ffOr1G0b_IcoIr7NTgV5o/edit)

Do not delete these during cleanup. Add an ARCHIVED or EXPERIMENTAL prefix, owner, canonical replacement link, and read-only/archive status after confirming their purpose.

## Documentation audit

### Outdated or contradictory documentation

- [README.md](../README.md) references a nonexistent public/character-schema.js.
- [docs/README.md](README.md) duplicates older setup instructions instead of acting as a documentation index.
- [docs/architecture.md](architecture.md) describes old paths and a CDN dependency even though Firebase is vendored; it does not describe the graph/session direction.
- [docs/builder-flow.md](builder-flow.md) omits Equipment, encourages page-local enforcement, and documents an obsolete onBeforeNext API.
- [docs/data-pipeline.md](data-pipeline.md) says Origins lack a workbook path even though the live workbook includes them.
- [docs/security.md](security.md) refers to old module paths and overstates CSP visibility despite the absence of a report endpoint.
- The source workbook README describes older v2/v3 structures, a missing backup tab, a nonexistent review column, and obsolete option adjacency rules. It omits the newer Origins and Weapons domains.

### Documentation that is missing

- the canonical current/target architecture and dependency direction;
- CharacterSession and preview/apply lifecycle;
- graph node, edge, source ownership, and removal semantics;
- grant and choice-type contracts;
- character schema, storage paths, codecs, and migrations;
- game-data schema, source authority, exporter contract, and release provenance;
- Rules purity and ownership;
- UI/CSS component ownership;
- accessibility requirements and supported browser matrix;
- test strategy and CI gates;
- local development, data export, release, rollback, and deployment checklists;
- operational credential handling;
- architecture decision records.

The present document should remain a dated audit. It should not replace living architecture documentation.

## Target architecture

~~~mermaid
flowchart TD
    UI[Pages and widgets] --> Commands[Typed builder commands]
    Commands --> Session[CharacterSession]
    Session --> Proposed[Persisted / working / proposed states]

    Proposed --> Compiler[GraphCompiler]
    GameData[Validated immutable GameData] --> Compiler
    Compiler --> Graph[Typed dependency graph]
    Graph --> Reconciler[Generic reconciler / fixed point]
    Rules[Pure Rules] --> Compiler
    Rules --> Reconciler

    Reconciler --> Impact[Structured impact report]
    Reconciler --> State[Reconciled state]
    State --> Diff[Canonical state diff / patch]
    Impact --> UI
    Diff --> Repository[CharacterRepository]
    Repository --> Codec[Codec + sequential migrations]
    Codec --> Firestore[(Firestore)]

    Source[Canonical Drive source] --> Export[Schema-driven exporter]
    Export --> Validation[Contract and referential validation]
    Validation --> Release[Versioned artifact + manifest]
    Release --> GameData

    Registries[Grant / choice / node registries] --> Compiler
    Registries --> Reconciler
    WidgetRegistry[Widget registry] --> UI
~~~

### Required dependency direction

| Layer | May depend on | Must not depend on |
|---|---|---|
| Pages/widgets | view models, commands, Rules for display hints | Firebase, graph internals, page-specific copies of capacity/prerequisite policy |
| CharacterSession | commands, compiler, reconciler, repository interface | DOM and live widget instances |
| Graph | normalized state, normalized game data, Rules, registries | DOM, widgets, Firebase, HTML |
| Rules | plain normalized values | fetching, Firebase, DOM, HTML generation |
| Repository | codecs, migrations, Firebase adapter | widgets/pages |
| Exporter | shared game-data contract and source adapter | runtime repair heuristics |

### Proposed graph model

Every meaningful choice node should have:

- nodeId: canonical and stable;
- nodeType: class, feature, option, feat, grant, choice, answer, technique, weapon, enhancement, bond, and so on;
- source: the owning node ID and source kind;
- definitionKey: stable game-data identity;
- storageBinding: canonical persisted path/key, or explicit derived-only status;
- prerequisites: normalized Rules expressions;
- grants: normalized grant references;
- selection state: selected, expected count, and completeness;
- display metadata: labels only, never identity;
- provenance: persisted, working, proposed, automatic, or derived.

Useful edge types:

- owns: a source owns a choice/answer;
- grants: a source creates another node/capacity;
- requires: a selected node depends on another fact;
- satisfies: a node/fact fulfills a requirement;
- materializes: an answer projects into a runtime collection such as weapons;
- excludes: two choices cannot coexist.

The engine should use edges to compute the affected closure. It should not need a new traversal branch for each new choice type.

### Proposed change lifecycle

~~~mermaid
sequenceDiagram
    participant W as Widget/Page
    participant S as CharacterSession
    participant G as Graph + Rules
    participant U as User
    participant R as Repository

    W->>S: typed command
    S->>S: clone working state into proposed state
    S->>G: compile and reconcile proposed state
    G-->>S: reconciled state + structured delta
    alt errors
        S-->>W: reject; render errors
    else confirmable removals/warnings
        S-->>U: show affected choices
        U-->>S: confirm or cancel
    end
    S->>S: commit exact reconciled state
    S->>R: canonical patch with version
    R-->>S: saved revision or visible failure
~~~

## Prioritized roadmap

### Milestone 0 — Stabilize and establish a checkpoint

**Goal:** prevent data loss and make the current refactor safely testable.

Implementation status (2026-08-03): the code and automated acceptance work are complete. See [Milestone 0 completion](./milestone-0-completion.md) for evidence, deferred browser checks, and the handoff into Work Package B.

Actions:

1. Create a named branch/commit checkpoint for the current uncommitted graph work before formatting or file moves.
2. Freeze production game-data exports until the live workbook/exporter contract is reconciled.
3. Add regression tests for:
   - errors never apply;
   - warnings never apply without the required confirmation;
   - class removal reports transitive source-owned answers;
   - Dazzling Wand removal reports/removes its chosen technique;
   - source-owned techniques do not consume normal slots;
   - generated/source-owned weapons cannot be independently orphaned;
   - two-tab sheet edits cannot overwrite newer builder data;
   - dialog controls resolve once and restore focus;
   - save failures remain visibly actionable.
4. Stop pre-clearing class-dependent state; let reconciliation calculate removals.
5. Restrict character-sheet autosave to sheet-owned fields.
6. Route all write failures through a persistent status/error surface and serialize saves.
7. Replace unsafe data-derived innerHTML in the identified paths.
8. Consolidate the confirmation dialog enough to eliminate duplicate IDs and unresolved promises.
9. Add global dirty-navigation protection.
10. Move service credentials outside the repository tree and document the admin procedure.
11. Fix small route correctness issues such as the root stylesheet path and stale 404 page in a separate low-risk patch.

Exit criteria:

- the critical scenarios above have automated coverage;
- no error preview is confirmable;
- destructive warnings cannot silently apply;
- permanent character data cannot be overwritten by sheet autosave;
- no production export can run without validation;
- the working graph files are tracked in a reviewable checkpoint.

### Milestone 1 — Define contracts before adding graph breadth

**Goal:** make stored character data and source game data explicit, versioned, and validated.

Actions:

1. Create a pure CharacterCodec with canonical defaults and exact field validation.
2. Add sequential CharacterMigrations and fixtures for every supported schema version.
3. Introduce a CharacterRepository and remove direct Firebase writes from pages.
4. Close the writer's open-ended builder path gate.
5. Define stable IDs for all persisted entities and prepare schema version 5 migration.
6. Define one game-data contract shared by exporter validation and runtime loading.
7. Split source adaptation, normalization, validation, and artifact writing in the exporter.
8. Add release provenance: source document ID/revision, export timestamp, schema version, exporter version, and content hash.
9. Remove runtime prose parsing and repair heuristics; errors belong in source validation.
10. Decide whether the handbook or source workbook owns player-facing prose for each domain.

Exit criteria:

- malformed or unknown character fields fail validation;
- old character fixtures migrate deterministically and idempotently;
- a complete data export is reproducible and diffable;
- exporter and runtime accept the same grant/prerequisite types;
- all persisted selections use stable IDs;
- release artifacts identify exactly which source revision created them.

### Milestone 2 — Build the CharacterSession and true graph core

**Goal:** make the graph authoritative for existence, breakage, and removal.

Actions:

1. Introduce CharacterSession with persisted, working, proposed, and reconciled states.
2. Replace arbitrary widget patches with typed commands and a canonical state-diff step.
3. Split GraphCompiler from GraphReconciler.
4. Define typed nodes, typed edges, source ownership, storage bindings, and structured impacts.
5. Traverse affected edges and reconcile to a fixed point.
6. Make errors non-confirmable and warnings policy-driven.
7. Introduce GrantTypeRegistry, ChoiceTypeRegistry, and NodeFactoryRegistry.
8. Make Rules pure and use the same functions for graph enforcement and widget display.
9. Add deterministic snapshot/property tests for graph compilation and reconciliation.

Exit criteria:

- the entire persisted character plus unsaved session changes compile into one graph;
- every selected answer has a source and storage binding;
- removing a source computes its full dependent closure without page logic;
- graph results are deterministic and independent of live widgets;
- the accepted in-memory state is exactly the state used to create the save patch.

### Milestone 3 — Migrate domains vertically

**Goal:** remove page-specific dependency/capacity authority in controlled slices.

Recommended order:

1. Finish Class, Feats, class features, option groups, Techniques, and technique-choice against the new session contract.
2. Migrate Equipment and source-owned weapon/enhancement choices because they currently have an integrity gap.
3. Migrate Attributes and primary-attribute prerequisites/capacity.
4. Migrate Origin, OriginFeatures, Skills, and origin-owned choices.
5. Migrate Bonds, Keystones, profile choices, and automatic/derived abilities.
6. Implement Boons as the extensibility proof.

For each slice:

- add node/edge factories and Rules tests;
- add source-removal and prerequisite-change tests;
- replace page-owned checks with session commands;
- make the widget a projection/editor only;
- delete the superseded page-specific code before moving on.

Exit criteria:

- every builder page uses the same session/preview/save lifecycle;
- no page calculates slots, prerequisites, or dependent removals;
- no choice widget mutates stored character state directly;
- Boons can be added without editing page controllers or graph traversal.

### Milestone 4 — Consolidate the UI system and sheet

**Goal:** make the website feel and behave like one application.

Actions:

1. Implement the shared UI primitives listed above.
2. Migrate CSS into explicit token/base/shell/component/route ownership.
3. Add semantic forms, labels, live regions, field error associations, and robust dialogs.
4. Add one app-wide SaveCoordinator and navigation guard.
5. Decompose character-sheet.js after save safety is proven.
6. Standardize landmarks, headings, step labels, status language, empty states, and actions.
7. Replace inline styling patterns so an enforcing CSP is practical.
8. Test keyboard, screen-reader, narrow viewport, print, and reduced-motion behavior.

Exit criteria:

- one dialog, status, field, and save behavior is used across routes;
- route CSS does not leak into unrelated pages;
- automated accessibility smoke tests pass on every major route;
- character-sheet modules have clear ownership and no direct permanent-field autosave.

### Milestone 5 — Automate source governance, tests, and documentation

**Goal:** prevent the architecture and data sources from drifting again.

Actions:

1. Add CI gates for unit, graph, migration, data-contract, rules, browser-smoke, accessibility, and formatting checks.
2. Rebuild the source workbook with schema/enums/normalized child tables and validation views.
3. Mark duplicate Drive workbooks as archived/experimental with replacement links.
4. Make Game-X-Data-Display fully generated or retire it.
5. Add content readiness status and block incomplete release rows.
6. Rewrite living documentation and add ADRs.
7. Add release/deploy/rollback checklists and artifact provenance review.

Exit criteria:

- a source edit cannot produce an invalid release artifact;
- a pull request cannot merge when graph, migration, rules, accessibility, or data-contract checks fail;
- living docs match paths and runtime behavior;
- obsolete workbooks identify their canonical replacement;
- the release process is repeatable by someone other than the original author.

## Recommended first three implementation work packages

These packages are small enough to review independently and ordered to reduce risk.

### Work package A — Save and preview safety

Includes:

- preview error/warning contract;
- removal of Class pre-clears;
- character-sheet write-scope fix;
- visible/serialized save behavior;
- dialog duplication/focus fix;
- dirty navigation guard;
- regression tests for each.

This package should not redesign the graph. It establishes safe semantics for the existing one.

### Work package B — Game-data contract and exporter repair

Includes:

- freeze/baseline current release artifact;
- document field mapping from the live workbook;
- shared grant/prerequisite enums;
- correct OriginFeature, Feat, roleplay question, and energy-cost handling;
- cross-reference and stable-ID validation;
- export report with provenance and artifact diff;
- resolution of the invalid "5" feature bucket and empty feat record.

Do not clean editorial content and rewrite the exporter in the same review. First make the existing intended source reproducible; then resolve content discrepancies through a tracked editorial backlog.

### Work package C — Character schema and session skeleton

Includes:

- pure codec/defaults;
- migration registry and fixtures;
- repository boundary;
- exact save schema;
- CharacterSession persisted/working/proposed lifecycle;
- typed SetClass and SetTechniqueSelection commands;
- state diff and structured impact types.

This creates the stable platform for the graph compiler/reconciler work.

## Test plan

### Unit tests

- Rules: capacity, expected counts, prerequisites, source-owned slot policy.
- Codecs: defaults, unknown fields, limits, exact round trips.
- Migrations: every version fixture, idempotence, invalid legacy data.
- IDs: canonical generation, aliases only during migration, collision checks.
- Export parser: every grant/prerequisite/choice type and malformed input.

### Graph tests

- deterministic graph snapshots for representative characters;
- source removal with multi-level transitive dependencies;
- prerequisite loss caused by another dependent removal;
- cyclic or contradictory data diagnostics;
- incomplete choice versus invalid choice;
- materialized weapon lifecycle;
- source-owned versus normal capacity;
- cancel leaves working state byte-for-byte unchanged;
- confirm commits the exact reconciled state;
- Boon extension test with no page-specific changes.

### Persistence tests

- concurrent tab/revision behavior;
- sheet-owned patch cannot modify permanent builder fields;
- failed write preserves dirty state;
- queued writes apply in order or coalesce deterministically;
- Firestore rules reject unknown/broad/schema-invalid writes;
- legacy path migration/retirement.

### Browser and accessibility tests

- each builder step loads, edits, previews, cancels, confirms, saves, and reloads;
- global and step navigation with clean, dirty, saving, and failed states;
- dialog keyboard/focus lifecycle;
- label association and field-error announcement;
- responsive layout at narrow/mobile/tablet/desktop widths;
- character sheet ownership mode and print;
- Characters, Profile, GM, 404, and auth redirects;
- axe checks on every route.

### Data-pipeline tests

- workbook fixture to normalized records;
- schema/enum validation;
- all foreign keys resolve;
- all choice grants have stable ownership and expected counts;
- release-ready rows contain no TODO/TBD or missing required fields;
- artifact snapshot/diff and content hash;
- runtime loads the freshly exported artifact without repairs;
- display workbook expected-output assertions if retained.

## Documentation plan

After the implementation boundaries are agreed, create or rewrite:

1. docs/architecture.md — current and target components, dependency direction, and ownership.
2. docs/character-state.md — schema, defaults, storage bindings, versions, migrations.
3. docs/dependency-graph.md — node/edge types, compilation, reconciliation, impact semantics.
4. docs/grants-and-choices.md — grant registry, choice ownership, answer/materialization contract.
5. docs/builder-flow.md — command, preview, confirmation, commit, save, navigation.
6. docs/game-data-contract.md — canonical fields, IDs, enums, source authority, provenance.
7. docs/data-pipeline.md — Drive-to-release process, validation, diff, rollback.
8. docs/ui-system.md — tokens, components, CSS ownership, accessibility rules.
9. docs/testing.md — test layers, fixtures, commands, CI gates.
10. docs/security.md — trust boundaries, escaping, CSP, Firebase rules, credential handling.
11. docs/deployment.md — environments, release checklist, rollback, post-deploy smoke checks.
12. docs/adr/ — short decision records for consequential choices.

Turn docs/README.md into a concise index instead of a second setup guide. Keep this audit as dated historical context.

## Decisions needed before Milestone 1

Record these as ADRs:

1. Which artifact is authoritative for player-facing prose in each domain: handbook or structured workbook?
2. Is Game-X-Data-Display a supported generated product or should it be archived?
3. Which derived character fields are persisted for performance, and which are always recalculated?
4. How long are legacy character schema versions supported?
5. Are grants/prerequisites normalized into child sheets or kept as a formally specified compact syntax?
6. Are stable IDs human-authored, generated once and frozen, or managed in a separate registry?
7. What warnings require confirmation, and which informational impacts can apply automatically?
8. What is the conflict policy for simultaneous tabs: last-write with field isolation, revision rejection, or merge?

## Definition of done for the rearchitecture

The rearchitecture is complete when all of the following are true:

- Firebase data plus unsaved session commands reconstruct one complete in-memory character.
- Every selected choice has a stable identity, source owner, grants, prerequisites, and storage binding.
- Graph edges, not page conditionals, determine the transitive effect of source removal.
- Errors block; configured destructive impacts require confirmation; cancel is side-effect free.
- Pages collect widgets and submit commands but contain no capacity, prerequisite, or dependent-removal policy.
- Widgets edit/display a choice type but do not own dependency truth.
- Rules are pure and shared by widgets and graph.
- Graph and Rules do not depend on DOM, widgets, Firebase, or live data fetching.
- All character reads pass through decode/migration/validation and all writes through one repository.
- Fresh game-data exports are reproducible, validated, provenance-stamped, and accepted by the runtime without repairs.
- Adding Boons requires a schema/registry adapter and widget, not page-specific logic.
- CI enforces graph, migration, data, rules, security, accessibility, and smoke-test contracts.
- Living documentation reflects the implementation and release sources.

## Bottom line

The highest-leverage move is not to add more graph cases immediately. First make previews and saves safe, then define the character and game-data contracts. Once CharacterSession owns persisted/working/proposed state, the current graph work can be evolved into a real compiler/reconciler without pages continuing to undermine it. That sequencing preserves the good work already present while removing the sources of inconsistency that caused the architecture to sprawl.
