# Game-data pipeline: Google Sheet to reviewed JSON

Status: living operational design. Read-only acquisition, schema-v4 read/validate/stage/diff, authenticated live acceptance, exact reviewed publishing, and rollback are implemented.

Last updated: 2026-09-20.

## Goals

- No routine browser export or manual XLSX download.
- No credentials or source snapshots committed to Git.
- One fixed canonical Drive file, authenticated with least privilege.
- Source acquisition, adaptation, normalization, validation, artifact construction, staging, diff, and publishing remain separate.
- Production JSON changes only by promoting a complete reviewed staging run.

## Canonical source

The source is [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit). Its non-secret locator and expected MIME/schema values live in `contracts/game-data-source.json`.

`npm run fetch:data` uses Google Drive `files.get` and `files.export` to acquire the entire native Sheet as XLSX. XLSX remains the transport boundary so spreadsheet formulas/tab structure are captured consistently with the old manual workflow.

The Drive API limits native-file exports to 10 MB. The acquisition module enforces the same limit, opens the XLSX structurally, verifies every tab named in `contracts/game-data-source.json`, and checks the workbook's `Metadata` schema/syntax versions and canonical workbook ID before writing anything.

## Handbook display and linked-table formatting

The September 20 follow-up converted 36 source sections to user-approved script-managed tables; see [the workflow](../scripts/handbook/README.md) and [activation status](status.md). Registered sections read populated rows and rich-text styling from their current `_Formatted` columns, so new rows and removed rows need no native range adjustment. The sequence is display **Update all Display → Formatted tabs**, then handbook **Refresh tables** or reopen. Source hyperlinks replace native **Update table** for converted sections. The fixed-range instructions and counts below document the earlier workflow and its verification; they do not override the managed bindings. The current managed-table readback verifies 476 populated rows and source typography, with all 49 total tables at the intended compact layout.

The September 20 Trait authoring path is canonical `Traits!A1:L1000` → hidden display `Traits` import → `Traits_Display!A1` → `Traits_Formatted` → the handbook's universal Traits catalogue. Its 12-column schema and provider semantics are defined in [game-data-contract.md](game-data-contract.md#traits-authoring-extension). The source tab has ID `920260001`; the display import, calculated output, and rich-text output have IDs `920260002`, `920260003`, and `920260004`. Preserve these IDs when updating native linked tables. The existing bulk formatter discovers the new pair automatically, bringing the current display pipeline to eight pairs without a separate formatting command.

The source migration preserves **77 distinct Traits**: **25 existing Monster/Familiar entries, 25 Mech upgrades, 19 Metamorphic adaptations, and eight approved Origin features**. **Sixteen duplicate groups** flag overlap for later discussion; no records or mechanics were merged. **Fourteen associated Techniques** were appended after a fresh 137-record prewrite read, giving **151 observed Techniques** and **120 main catalogue blocks**. The existing 31 weapon-specific exclusions remain unchanged. Eleven provider rows in `ClassFeatures` and `OriginFeatures` retain their activation/choice rules while referring to Trait records through prose and the new N `traitKeys` column. Preserve concurrent source edits rather than restoring earlier technique or feat totals.

Trait blocks use `Name - Rank N`, separate Prerequisites/Tags lines with bold labels, a blank line, and unlabeled benefit text plus unchanged `Rank N+` notes. Blank prerequisites render `None`; blank tags render an em dash; a blank rank renders `Rank ?` and `Incomplete Trait`. Duplicate and concise review notes remain italic. Associated technique references appear naturally in Trait prose, while the complete techniques are rendered once by the existing `_TechniqueBlocks` pool and remain in the general catalogue unless the separate weapon-specific rule excludes them. The display does not infer ranks, tags, costs, stacking, or grant availability.

Install the source records and wait for the display import and shared technique pool to recalculate before regenerating formatted outputs. The Trait formula checks that each `traitKey` is unique and every `techniqueKeys` reference resolves exactly once; failures produce a formula error that stops the bulk formatter before any output changes. `Function_Tests!A34:D38` covers Trait source/display coverage, formatted coverage, reference resolution, preservation of nonempty rank notes, and headings/incomplete notices. The generic formatter's local tests also cover the new pair, stable output IDs, multiline text preservation, and stopping on Trait reference errors. Native source-to-rich-text and handbook readback remain separate acceptance checks; current final evidence belongs in [status.md](status.md).

This migration is an authoring/display extension, with local plans and recovery evidence ignored under `.staging/traits-migration-2026-09-20/`. It does not extend the runtime exporter, introduce executable Trait grants or character storage, publish JSON, or authorize production deployment. The live `Traits` tab, provider `traitKeys`, unresolved rank/access data, and earlier authoring extensions must receive explicit adaptation, normalization, reference validation, and runtime integration before a new reviewed release candidate. Linked-table publication into the handbook does not satisfy `stage:data` acceptance.

The handbook follows a separate display path: the canonical Sheet feeds [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit), whose rich-text outputs are linked into the [Player Handbook](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit). The initial weapon migration expanded the catalogue from 110 to 141 records. After the user deleted `snap-kick` and `crooked-cobra`, regeneration and native catalogue resizing were verified at `Techniques_Formatted!A1:A139`: all 139 handbook entries matched their formatted source text and non-whitespace bold/italic styling. That is the verified pre-refinement checkpoint. The completed weapon-card refinement retains every canonical record while excluding the 31 base-specific actions from the main alphabetical catalogue. At the observed 139-record source checkpoint the verified main range is `Techniques_Formatted!A1:A108`; recompute that range after further user edits. The damage/pumping source update, regenerated outputs, native links, and handbook cleanup all passed the refinement checks below. This path does not publish runtime JSON.

The technique display formula emits `**title**` and `*Access*` markup for the workbook's native **Format Sheet** generator. Regenerate the rich-text output after changing source/display formulas, then refresh the native Docs links. Preserve meaningful `rankNotes` and other authored higher-rank benefits in that display flow. The `_Techniques!A1` compatibility import now projects its 35 columns by header name after the existing cost/prerequisite conversions, preserving the display consumers' expected order when canonical columns move. `Function_Tests!A39:D39` verifies all 35 positions. The shared renderer tests field presence by text length so blank imported fields remain unknown while numeric zero remains an authored value; row 40 checks missing-mechanic notices across all 14 new drafts. Native acceptance and any concurrent-source drift are recorded in [status.md](status.md).

The current compact authoring default puts linear starting damage and growth in one `damage` line, leaves `damageByRank` blank, and avoids duplicate per-rank explanations. The [technique contract](game-data-contract.md#compact-damage-and-pumping) records the Spirit Blast and Spacium Ray examples. Preserve their distinct rank bases, pumping schedules, and minimum costs. Keep all source pumping map values; the shared renderer groups adjacent equal coefficients with matching units, preserves rank gaps and separate nonconsecutive runs, and retains units such as armor or ward. Irregular `damageByRank` maps remain an explicit display fallback. Catalogue entries, excerpts, and weapon-base cards consume that same renderer.

The verified follow-up removes repeated automatic-availability statements from weapon-base cards and the entire provider/availability line from full technique blocks, including draft intended availability. Retain the skill Access line, `Incomplete technique`, and missing-action/cost notices. Source readback verified removal of only `0 Energy before optional pumping.` from **23 AA (`rankNotes`) cells**: **19 are blank and four retain the Rank 0 no-pumping restriction**. All other source cells across **139 techniques** are unchanged, preserving relationships, selection modes, prerequisites, costs, damage, pumping values, and meaningful notes. Evidence is ignored at `.staging/weapons-migration-2026-09-19/redundant-lines-source-readback.json`, SHA-256 `33154344F135650A1BD00F929F8AAFB682A7B796791AA04597A414BF3759A2B6`, exported `2026-09-19 18:00:06 UTC`; source modification time is `2026-09-19T17:58:02.544Z`, with no Drive version available.

Wording-cleanup acceptance passed all **32 native Function_Tests**, including **23 compact basics** and retention of all **13 nonempty rank notes**. The three redundant line types are absent from all **139 rendered techniques**, **31 base cards**, and handbook tables. All **153 linked entries** match Sheet text and non-whitespace bold/italic flags. All **50 tables** retain **468-point width**, **459 rows at zero minimum height**, and **1,167 cells**; three native **Match spreadsheet data and formatting** repairs and **34 layout requests** were scoped to three weapon tables. Native review confirmed the readable Longsword card without the three lines. Final evidence is ignored at `.staging/weapons-migration-2026-09-19/redundant-lines-final-verification.json`. Standard preflight passed **256 unit tests**, **9 frozen artifact checks**, and **14 HTML asset checks**. Runtime publishing, deployment, and `WPE-DOMAIN-MIGRATION` signed-in acceptance remain deferred; earlier compact-format results below are historical evidence.

The preceding September 19 compact-format source readback verified exactly **69 cells in R/Y/AA across 23 basics**, with every former damage-map value proved equal to the compact formula before clearing. Pumping maps and all other source cells across the **139 observed technique records** were unchanged. All **32 native Function_Tests passed**, and formatted content was verified for **108 main entries, 14 generic weapon-excerpt entries, and 31 base cards**. Source evidence is ignored at `.staging/weapons-migration-2026-09-19/compact-technique-source-readback.json`, SHA-256 `5A1762511E289DF0224A29413FD1161BCF7EDA028D8DA147E189774CD2DB275F`, source modification time `2026-09-19T17:35:27.287Z`, with no Drive version available.

The compact-format native handbook refresh passed final verification: **153/153 entries** match current Sheet text and every non-whitespace character's bold/italic flags. All **50 tables** retain **468-point width**, with **459 rows at zero minimum height** and **1,167 cells**. The final **34 layout requests affected only three changed weapon tables**; native visual review confirmed Longsword's compact damage and single pumping line and the Rank 0 Broomstick entry. Evidence is ignored at `.staging/weapons-migration-2026-09-19/compact-technique-final-verification.json`. Unit tests passed **256/256**, the frozen baseline matched all **9 artifacts**, and asset validation passed all **14 HTML files**. This correction changes authoring/display behavior only; application code, runtime publishing, deployment, and the deferred `WPE-DOMAIN-MIGRATION` signed-in acceptance boundary are unchanged. These checks are not authenticated runtime-source acquisition or a staged release candidate; earlier refinement results below remain historical evidence.

The following helper ranges in `Techniques_Formatted` provide reusable excerpts without maintaining duplicate source mechanics:

| Range | Handbook content |
|---|---|
| `D1:D3` | Rank 0 Unarmed Strike, Shove, and Grapple, resolved by stable technique keys |
| `F1` | Rank 1 Telepathic Link |
| `H1:H9` | Nine migrated Rank 2 techniques |
| `J1:J2` | Two migrated Rank 3 techniques |
| `L1:L14` | Existing weapon-technique excerpt after preserving the user's removal of Brutal Strength and Bullet Spray |
| `N1:N31` | The 31 base-specific basic attacks and alternatives, retained as a generated helper excerpt and in the shared all-technique pool; excluded from the main alphabetical catalogue under the approved refinement; no separate handbook table is required for N |

Use **Format Sheet → Update all Display → Formatted tabs** to regenerate every `_Display` tab's matching `_Formatted` output in one run. The [bulk formatter](../scripts/display/README.md) includes hidden display tabs, creates missing outputs, and preserves existing output sheet IDs and the technique excerpt columns above. It uses the existing markdown parser, validates all source values before writing, restores the originally active tab, and reports completion or an incomplete destination if a write fails. It reads current calculated values after flushing pending Sheet changes; it does not force Google to refresh an upstream `IMPORTRANGE`. Wait for imports to finish before running it. The individual-tab commands remain available. After generation, native handbook links still require Google Docs **Update all**.

The canonical `Techniques!A87:AI98` holds the 12 complete techniques migrated on September 18. The earlier September 19 authoring migration added 15 unfinished weapon techniques, retaining stable keys, original prose, questions, and provenance. Subsequent user edits removed `brutal-strength` and `bullet-spray` and changed several remaining drafts; the fresh pre-weapon snapshot had 110 Techniques, 75 Feats/option rows, and 67 ClassSkills relationships. Preserve those edits and insertions rather than rebuilding from the older 112-technique checkpoint. Deflect Projectile retains its existing canonical row, with original reference wording in notes. The separate `TechniqueDrafts` tab was removed. The shared `_TechniqueBlocks` pool must enumerate every canonical technique key, including records without assigned skills. The main `Techniques_Display!A1` catalogue filters only the base-specific actions from that pool; ordinary incomplete and generic techniques remain included. Unknown rank/access render as **Rank TBD** and **Access: Unassigned**, without invented free/zero-energy mechanics. Column L retains the 14 surviving excerpt keys, and existing excerpts must resolve from the shared pool rather than from the filtered main catalogue. Rank 0 excerpts follow current canonical damage and pumping rules.

The hidden `_TechniqueBlocks` helper uses `A1:A1000` for stable keys, B for the specific weapon owner or blank, and C for the complete rendered technique block, retaining source order. Columns F:G hold one direct canonical import of technique keys and raw prerequisites, with headers in row 1. A nonblank owner requires both an exact `weapon | key=<base> | wielded=true` prerequisite and membership in that base's `techniqueKeys`; a generic technique referenced by a base is not automatically a base-specific action. `Techniques_Display!A1` alphabetically sorts the owner-blank blocks, D/F/H/J/L resolve excerpt keys against pool A:C, and N dynamically selects the blocks with a specific owner. Weapon-base cards use the same full blocks for every referenced key. `_TechniqueBlocks` is a helper, not another Display/Formatted pair; preserve the existing output tab IDs. The Trait migration adds an eighth pair to the preceding seven.

The initial weapon migration appended 31 Techniques at the then-current `A112:AI142`, for 141 total before the user's subsequent two deletions: 23 canonical basic/alternative actions are `granted-only`, and eight previously omitted Rank 2 handbook actions remain `draft`. All 31 migrated records remain intact. Nine critical profiles moved into ordinary critical-success fields. All new rows use `weapon | key=<weaponKey> | wielded=true` and state `Wielding <base name>.`; damage/pump tables explicitly scale with weapon rank. The 33 migrated `WeaponProfiles!A2:AE34` values were retired after readback, while the exact header and hidden tab remain for required-sheet acquisition compatibility; its Schema declarations are deprecated.

The verified weapon-card refinement established automatic growth for all 23 basics per weapon rank above the base minimum, preserving current starting damage: +3 for the 13 standard attacks, +2 for Bow, both Daggers / Kunai attacks, Shuriken, Shield, Staff, Chain Sword, and Grenade Launcher, and +4 for Greatsword and Warhammer. The exact groups and formula are in [game-data-contract.md](game-data-contract.md#weapons). It extended the existing optional-pumping schedule to the six basics that lacked it: no pumping at Rank 0, +1 damage/Energy at Ranks 1–2, +2 at 3–4, and +3 at 5–6. Every basic uses `energyCostKind=variable`, blank numeric Energy, and a 0-Energy base attack with optional pumping. Source readback verified the approved 73 changed cells across these 23 basics; the user's concurrent Deflect Energy skill and Rank 2 edits were preserved. The later compact-format correction represents this same linear growth in `damage` and clears redundant `damageByRank`. Its initial concise `rankNotes` retained the zero-Energy sentence and Rank 0 no-pumping note; the latest wording cleanup removes only that zero-Energy sentence. Pumping map values remain unchanged. Keep fixed/unknown alternative costs unchanged, including Pistol Bullet Spray's 2 Energy and Machine Gun Bullet Spray's 2 Actions/4 Energy. The Rank 2 basics remain draft because missing actions and other fields are still unresolved; assigning their damage/pumping does not make them release-ready.

`WeaponBases` has I `techniqueKeys` and J `traitsText`. Twenty-two bases reference 32 techniques, including the existing draft `covering-fire`; weapon-provided access is automatic while wielded and does not spend ordinary technique choices. Iaijutsu stays in Katana's trait text. Rank 2 tags are filled from the handbook, while the remaining incomplete bases retain explicit gaps. The display imports `WeaponBases!A1:J1000`. Under the approved refinement, all 31 base cards render base name/rank, tags, description, traits, and the complete formatted blocks for their ordered `techniqueKeys`, replacing the initial name-only technique list. Resolve those blocks by stable key from the shared all-technique pool, including generic Covering Fire; never look them up through the filtered main catalogue or maintain a second copy of mechanics. Omit repeated availability/provider statements while retaining `Incomplete technique` and explicit missing-action/cost notices; a draft's source selection mode remains unchanged.

For future linked-content changes, reconcile coverage against a fresh source read, preserving subsequent user edits instead of restoring a historical total. Check each basic's starting damage, automatic rank increments through Rank 6, and separate pumping rates; verify that alternative costs and unrelated source cells remain unchanged. Regenerate the formatted outputs, resize the main native catalogue link to its current calculated row count, and refresh all six existing weapon-base links while preserving their sheet IDs, typography, and zero row minima.

The completed refinement verified **139 pool records, 108 main catalogue records, 31 base-specific exclusions, and all 32 references across 31 base cards**. All **29 Function_Tests passed**; formatted ranges contain A108, N31, and L14. Native handbook readback matched all **153 linked entries**—31 base entries across six rank tables, 108 main techniques, and 14 generic weapon-excerpt entries—in text and every non-whitespace character's bold/italic styling. Five linked-table formatting overrides were cleared with **Match spreadsheet data and formatting**. Weapon cards have TOP vertical alignment in the source display and handbook, and the catalogue introduction distinguishes general alphabetical techniques from weapon-base entries. After those checks, the obsolete **8-row, 6-column Weapon Damage table** was removed, leaving its heading and a replacement explanation; the former rank-band values and special Rank 6 jump no longer compete with the embedded rules. Final evidence is retained in ignored `.staging/weapons-migration-2026-09-19/refinement-final-verification.json`; the earlier results below remain pre-refinement historical evidence.

At the initial migration checkpoint, the native bulk command completed all seven display/formatted pairs and created `WeaponBases_Formatted` with sheet ID `1175877209`, preserving existing output IDs. Readback verified text and bold/italic runs for all 31 full catalogue cards at `A1:A31` and all 31 cards across the following six rank excerpts. All six rank excerpts were inserted as native linked handbook tables in their corresponding weapon-rank sections. The completed refinement reuses these same links and ranges, with the full embedded technique content verified after refresh.

| Rank | Formatted base range | Verified cards |
|---|---|---:|
| 0 | `C1:C4` | 4 |
| 1 | `E1:E14` | 14 |
| 2 | `G1:G4` | 4 |
| 3 | `I1:I5` | 5 |
| 4 | `K1` | 1 |
| 5 | `M1:M3` | 3 |

All 24 `Function_Tests` checks passed at the initial 141-record snapshot. The subsequent user deletions briefly left formatted technique coverage at 201 cells while calculated output dropped to 199; regeneration resolved that stale-output difference without restoring deleted records. The pre-refinement post-deletion audit passed all 24 checks with 199 formatted and 199 calculated cells, 139 source/catalogue entries matching 139 handbook entries exactly in text and non-whitespace bold/italic styling, 14 existing weapon-excerpt rows in L, and 31 migrated rows in N. These historical counts must not be used as the acceptance target for the new 108-entry main catalogue and shared pool. Preserve output sheet IDs and existing unrelated excerpts. Ranged Weapons / `ranged-weapons` replaces the authored combat-skill label/key throughout source and display; unrelated stable entity keys remain unchanged. Recovery snapshots, exact approved source edits, installed display formulas, and the prior `final-verification.json` are ignored under `.staging/weapons-migration-2026-09-19/`.

For feats, `_Feats!A1` normalizes the imported columns by header name; `Feats_Display!A2` compacts class-feat rows before formatting. `Feats_Display` became empty because its consumers interpreted the reordered source columns by position. Maintain the header lookup rather than restoring positional assumptions. At the earlier consolidation checkpoint, native handbook links covered 22 class feats and 49 archetype memberships. The current source/display has 24 class feats and 50 archetype memberships; the live membership check confirms all 50 keys, including after concurrent source insertions. Mixed Stance is a class feat and correctly contributes no archetype membership. The Weapon Master ranges are `Feats_Formatted!E2:E8` and `Archetypes_Formatted!E1:E9`. Refresh and expand native links when their source ranges grow.

All archetype membership is authored in canonical `Feats`: `archetypeKey` is the Archetype Member dropdown, and `archetypeName` supplies the display label once on the entry feat. Resolve those columns by header name because the user may reorder them. Each top-level member reuses the stable key; nested OPTION rows inherit membership through `parentKey`. `category` supplies the subclass's class or `multiclass`. Prior-feat requirements are written once in `prerequisites` as `archetype | <archetypeKey> | numFeats=N`; absence of a same-group count condition means zero. Existing stable keys are preserved even where labels changed (for example `sparkling-idol` / Shining Protector). The separate canonical `ArchetypeFeats` tab was removed. The hidden display `_ArchetypeFeats` is now a generated six-column compatibility view imported directly from canonical `Feats`, not an editable second source. It must not depend on `_Feats`, because `_Feats` already uses it to render prerequisite labels.

The user explicitly approved this authoring migration with exporter compatibility deferred. Blank technique ranks/skills and the new Feats fields are intentional source/display extensions; do not invent mechanics or silently omit records to make export pass. Before a future runtime release, adapt and validate the new contract separately. Recovery snapshots and installed formulas are ignored under `.staging/authoring-migration-2026-09-19/`.

Archetype prerequisite display resolves the group referenced by the prerequisite, rather than assuming the feat's own group. `Archetypes_Display!A1:G1` suppresses the separate previous-feat metadata line only when a uniquely named prerequisite group and its required count match that membership. Other prerequisites remain visible. The class and archetype display formulas also normalize the formatter's stray single-line `Grants:   * ` prefix; preserve genuine lists and choice bullets.

Maintain linked-cell typography in the display Sheet's rich-text formatting: bold technique title, italic Access line, and explicitly nonbold body text. Apply future typography changes there and refresh the linked table; do not maintain a second set of title/body styles directly in Docs.

If a refresh produces incorrect formatting despite correct source rich-text runs, use the linked-table menu's **Match spreadsheet data and formatting** action to clear Docs formatting overrides for the whole linked table. Then use ordinary **Update Table** for source changes. This action matches source typography and table formatting, so review the resulting layout as well as the text. It is a repair action, not a documented persistent setting.

Keep handbook table row minimum heights at zero so content determines the height. Native range expansion can import source-sized minimum heights into added rows while original rows remain at zero. After expanding ranges or matching spreadsheet formatting, inspect the affected tables and bulk-reset positive `minRowHeight` values to zero. Inspect paragraph bullets and indentation separately; remove accidental list formatting only from confirmed affected cells, preserving genuine lists. The 2026-09-19 repair reset 51 rows across nine tables, including a short Dark Witch entry with a 982.5-point (13.65-inch) minimum. Final verification found zero positive minima across all 21 relevant tables. A controlled Weaponsmith ordinary-refresh test changed the paragraph count and preserved bold title, regular body, no native bullets, and zero row minimum; exact source value/format/rich-text runs were restored and refreshed. All 62 feat/archetype entries matched current display text and non-whitespace character bold flags; genuine list text and metadata were preserved.

On 2026-09-18, four techniques had entirely bold, 14-point text in Docs while every source cell had explicit nonbold body runs. Matching the table to the spreadsheet repaired all four without individual Docs cell edits. Three subsequent ordinary refreshes, including temporary paragraph-break changes, preserved mixed formatting. Final verification covered all 85 entries, with bold titles and no bold body runs; temporary source changes were restored exactly. When changing this workflow, verify both the source rich-text runs and the rendered handbook after a changed-cell refresh, including a change in paragraph count.

The later 2026-09-18 migration verified all 97 catalogue rows, all 31 technique-helper rows, and all 62 class/archetype feat rows against the display outputs, with bold titles and nonbold body text. The original 85 canonical technique records were unchanged across all 2,975 fields. The catalogue retained its 468-point width, matching the document's stored 6.5-inch content area. These are source/display/handbook checks; they do not establish runtime release readiness.

The 2026-09-19 uniform-layout follow-up adds a bound handbook formatter, maintained in [scripts/handbook](../scripts/handbook/README.md). It sets all table widths to the normal text width while preserving column proportions, left-aligns text, top-aligns cells, applies 1px-equivalent (0.75-point) light-grey `#e0e0e0` borders, clears row minima, applies alternating light-grey/white rows, and uses compact 3-point vertical/4-point horizontal padding. It preserves text, emphasis, native links, and genuine list indentation. The public Docs API is necessary because the basic Apps Script border setter leaves explicit cell-border overrides behind. Exact field masks and a required revision guard constrain every write.

The earlier uniform-layout checkpoint formatted and verified 45 tables. Adding the six weapon-base tables increased that to 51 tables; the intermediate snapshot contained 500 table rows and 1,248 cells. After the two-row catalogue shrink, the verified pre-refinement handbook contained 51 tables, 498 rows, and 1,246 cells. Every table had 468-point total width within floating-point tolerance and zero positive minimum row heights. A revision-guarded style-only merge preserved all table text and emphasis while retaining concurrent unrelated handbook paragraph edits. After the main catalogue reduction and verified removal of the old Weapon Damage table, the completed refinement audit found **50 tables, 459 rows, and 1,167 cells**, all at **468-point total width** with **zero positive minimum row heights**. Its final **164 style-only requests targeted five changed tables**, preserving other content. These measured totals are checkpoint evidence, not fixed output requirements for later edits.

The bound formatter is active as of September 20: the user approved Google's service terms, the missing **Docs** advanced service was enabled and saved, and automatic-open and **Handbook → Format tables** executions both successfully formatted all 50 observed tables. Setup runs safely from the script editor without calling the document UI. It uses `getUserTriggers(doc)` rather than comparing a trigger's internal Docs source ID with the Drive document ID, preserves unrelated triggers, and retains exactly one formatter open trigger for the installing user. There is no timed job. Opening the handbook as an editor applies the style automatically; after native **Update all**, the menu command reapplies it on demand. Google exposes no linked-table-refresh event.

## Authentication

The command uses Google Application Default Credentials (ADC). It never uses browser/Firebase login state or Codex connector credentials.

### Preferred: short-lived service-account impersonation

Use a dedicated service account, conventionally `game-x-sheet-exporter`, with these boundaries:

- share only the canonical Sheet with the service-account email as Viewer;
- no domain-wide delegation;
- no project-wide content/data role;
- grant each authorized developer `roles/iam.serviceAccountTokenCreator` on that service account only;
- enable the IAM Service Account Credentials API and Google Drive API in the owning project.

Create normal user ADC once:

```powershell
gcloud auth application-default login
```

Then select the read-only target identity for the current shell:

```powershell
$env:GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT = "game-x-sheet-exporter@YOUR_PROJECT.iam.gserviceaccount.com"
npm run data:source:check
```

The source identity receives the Cloud scope needed to call IAM Credentials. The impersonated short-lived token receives only `https://www.googleapis.com/auth/drive.readonly`.

### Fallback: external service-account key

If impersonation cannot be configured, store a dedicated service-account key outside the repository, share the Sheet with its service-account email as Viewer, and set:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\your-name\.config\game-x\credentials\sheet-reader.json"
npm run data:source:check
```

The script rejects credential paths inside the repository, including external-looking symlinks/junctions that resolve into it. Do not put the key in `.env`, an ignored repository directory, source code, scripts, documentation, screenshots, or chat.

### Fallback: user OAuth ADC

Direct user ADC must be created with a custom OAuth client and explicit Drive read-only scope; ordinary Cloud-only ADC cannot read Drive. Follow Google's ADC guidance for non-Cloud scopes and use `gcloud auth application-default login --client-id-file ... --scopes ...`. Store the OAuth client file outside the repository.

References:

- [Drive files.export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)
- [Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Local Application Default Credentials](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
- [Service-account impersonation](https://cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Service-account security](https://cloud.google.com/iam/docs/best-practices-service-accounts)

## Current commands

### Check access without writing

```powershell
npm run data:source:check
```

This requests and validates only Drive metadata. It confirms the fixed file ID, expected name/MIME type, download permission, Drive version, and modification time.

### Fetch a source snapshot

```powershell
npm run fetch:data
```

This performs:

1. metadata read;
2. XLSX export into memory;
3. second metadata read;
4. rejection if Drive `version` or `modifiedTime` changed during export;
5. XLSX size, structure, required-tab, and `Metadata` contract validation;
6. SHA-256 calculation;
7. rollback-protected paired replacement of the ignored snapshot and provenance sidecar.

Default outputs:

```text
.staging/game-data/source/game-x-class-data.xlsx
.staging/game-data/source/source-provenance.json
```

The sidecar contains file ID/name, source/export MIME types, source schema and syntax versions, Drive version, modification time, fetch time, byte length, web link, and exact XLSX SHA-256. It never contains tokens, auth headers, credential paths, or account claims.

For an explicit ignored/recovery path:

```powershell
npm run fetch:data -- --out C:\temporary\game-x.xlsx --provenance C:\temporary\game-x-source.json
```

Explicit targets are accepted only beneath this repository's real, non-redirected `.staging` directory or completely outside the repository. Symlinks/junctions that redirect either location back into repository content are rejected. The workbook and provenance targets must also be distinct, non-nested file paths. This prevents the acquisition command itself from overwriting source code, contracts, or frozen production JSON.

### Fetch, validate, and stage

```powershell
npm run stage:data
```

This fetches the canonical Sheet, reads and validates schema v4, constructs deterministic runtime artifacts in memory, verifies them through current runtime loader APIs, and installs a complete unique run under:

```text
.staging/game-data/runs/<timestamp>-<process-id>/
  source-provenance.json
  validation-report.json
  artifacts/
  export-report.json
  artifact-diff.json
  artifact-diff.md
```

Unique run directories prevent a failed attempt from being confused with stale artifacts from an earlier attempt.

The reader, adapters, validator, schema-v2 artifact builder, runtime-load acceptance, atomic staging writer, and structural/semantic diff are fixture-verified. `WPB-SOURCE-ACCESS` and authenticated staging completed for the prior published release; each subsequent source revision still needs its own successful immutable run. Do not weaken validation, skip rows, or add coercions just to make a live command green.

Inspection during the September 18–20 handbook migrations found live-source publishing blockers: `Feats` headers and its new archetype fields do not match the current adapter contract, archetype DSL is unsupported by the runtime registry, and incomplete Techniques may have blank ranks/skills. The former `ArchetypeFeats` source tab has been consolidated into Feats. WeaponBases also declares technique/trait fields, and its retired profile tab is only a compatibility placeholder. The new `Traits` table and ClassFeatures/OriginFeatures `traitKeys` add further authoring relationships outside the accepted adapter and runtime registries. The exporter and runtime acquisition graph have not been integrated with these relationship models. The user explicitly deferred this integration; no live `stage:data` release candidate or runtime publish was performed for these migrations. The nine frozen production JSON files remain unchanged. Resolve the source/runtime contract before preparing a new release candidate; header-only acquisition compatibility is not evidence that adaptation or runtime loading supports the new mechanics.

### Verify frozen production

```powershell
npm run baseline:data
```

This verifies exact filenames, byte lengths, SHA-256 hashes, release metadata, and structural counts for the nine reviewed production artifacts.

`npm run export:data` still targets `public/data/game-x` and intentionally fails before reading/writing. It remains a negative safety boundary: production can be changed only by the separately approved exact-byte publisher.

## Staging run

One command creates an immutable ignored run:

```text
.staging/game-data/runs/<run-id>/
  source-provenance.json
  validation-report.json
  artifacts/
  export-report.json
  artifact-diff.json
  artifact-diff.md
```

Implemented phase boundaries:

```text
Drive acquisition
  -> workbook reader
  -> source-version adapters
  -> shared expression/scalar normalization
  -> schema/cross-reference/domain validation
  -> deterministic in-memory artifacts
  -> staged write
  -> byte and semantic diff
```

`scripts/game-data/workbook-reader.mjs` owns only XLSX decoding, raw headers/values, and physical row numbers. `scripts/game-data/source-adapters.mjs` owns schema-v4 tab/header meaning and returns `{ ok, model, diagnostics }` without file I/O. `scripts/game-data/model-validator.mjs` merges adapter findings with duplicate, ownership, reference, choice, status, readiness, and domain findings in deterministic workbook order. Populated invalid rows remain represented when possible; any meaning that cannot be adapted or validated produces a source-located diagnostic. None of these phases writes artifacts. `artifact-builder.mjs` accepts only that validated model, and `staging-run.mjs` owns the later file-I/O boundary.

No runtime artifact is written if validation or runtime-load acceptance has errors. A validation report and provenance may still be staged. The reports record source schema, runtime artifact schema, exporter version, Drive version/time, fetch/export timestamps, raw XLSX/model/artifact hashes, counts, warnings/errors, runtime acceptance, and diff summary. The raw XLSX hash identifies the fetched transport bytes but is not runtime revision identity because Google may produce byte-distinct XLSX ZIPs for the same native Sheet revision. Runtime artifact bytes use the stable Drive revision plus normalized-model hash and omit raw transport hashes and volatile timestamps, so the same validated source revision produces identical hashes in different runs.

The semantic diff uses stable identities and reports added, removed, changed entities and every changed field path. Byte hashes alone are not sufficient. The legacy schema-v1 comparison bridge maps an old technique name to the matching new stable key; this is compatibility analysis, not permission to restore display-name identity. Existing profile diff support uses the explicit `weaponKey/profileType/profileName/rank` composite. A future weapon-migration release must review those legacy profile removals alongside the new stable technique records, base relationships, traits, and skill-key changes; the current source no longer calls for a new profile identity.

## Publishing boundary

Publishing is a separate exact-byte operation. The checked-in `contracts/game-data-release.json` records the approved run, source/model hashes, every artifact hash and byte length, and both approval gates. Run:

```powershell
npm run publish:data -- --confirm <approved-run-id>
```

The publisher does not authenticate, fetch, adapt, regenerate, or infer approval. It fails unless all of the following match exactly:

- zero structural validation errors;
- runtime-load acceptance of staged artifacts;
- approved source/model/artifact hashes;
- completed semantic diff review;
- explicit diff-review and publish approval booleans plus the matching CLI confirmation;
- updated release baseline and rollback record.

It also verifies that the currently installed production bytes still match their existing baseline, reruns runtime acceptance against the candidate, installs only the nine approved artifact names, removes stale runtime files, and updates `contracts/game-data-release-baseline.json` in the same transaction. If either installation fails, it restores both the prior production directory and prior baseline. The generic exporter remains frozen so a fresh source run cannot bypass review.

Fetch, stage, and publish must never be aliases for the same side-effecting operation.

## Canonical-Sheet edit approval

Source resolution is not automatic cleanup. Read-only inspection, validation, or permission to proceed with a roadmap step does not authorize Sheet writes. Before any connector, API, script, or browser automation changes the canonical Sheet, present the exact tabs/ranges, proposed values or contract changes, and reasons, then obtain explicit user approval for that edit batch. Repository validator/exporter corrections and source editorial changes remain separately reviewable.

## Runtime artifacts

The website loads `public/data/game-x/game-x-data.json`; domain files remain checked in for review/tooling. The reviewed schema-v2 production release contains:

- `classes.json`
- `class-skills.json`
- `class-features.json`
- `feats.json`
- `techniques.json`
- `origins.json`
- `weapon-bases.json`
- `weapon-enhancements.json`
- `game-x-data.json`

`export-report.json` is run metadata beside staged `artifacts/`, not a runtime artifact, and was removed from production during the schema-v2 publish. The v2 bytes preserve `ClassSkills`, stable technique keys, status/selectability, structured costs and expressions, source revision identity, and explicit stubbed subsystems. Source rows are not dropped merely to preserve the old file list.

## Failure policy

- 401/403: stop with concise setup guidance; never print provider bodies/tokens.
- 429/5xx/network failure: bounded retry, then stop.
- wrong file/name/MIME, trashed source, or no download permission: stop.
- source version changes during export: discard bytes and retry in a new invocation.
- empty, oversized, structurally unreadable, wrong-version, or wrong-workbook response: stop without replacing the last valid snapshot.
- validation errors: stage diagnostics only; write no artifacts.
- generic production export: reject before reading or writing; only the exact reviewed publisher may install production bytes.

The local snapshot is a convenience, not a fallback authority. If Drive is unavailable, use an explicitly supplied known snapshot only for offline parser development and label its provenance; never treat it as a releasable current source.
