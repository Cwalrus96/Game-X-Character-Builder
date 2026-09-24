# Dependency consequence review — September 24, 2026

Lowering Ranged Weapons to zero with a Shuriken selected previously failed before the shared confirmation dialog. Reconciliation lowered the weapon to rank zero, then the next compiler pass rejected that intermediate state because the weapon requires rank one. Losing Enhancement capacity could also raise a compiler error, as could an Enhancement prerequisite disappearing on a feature-granted weapon.

The repair stays in shared Rules and the Character Dependency Graph. A weapon is reduced only to a legal rank; otherwise it is removed in the proposed state. The graph continues through dependent selections and presents their combined consequences through the existing `CharacterSessionPage` dialog. Cancel preserves the accepted character; Apply Change accepts exactly the reviewed result. All seven migrated builder pages load the updated shared modules.

Enhancement capacity is now a reconcilable graph node. Capacity fitting runs after sources, ranks and compatibility settle, preserves earlier stored purchases and reviews removal of later excess purchases. Free granted Enhancements remain outside paid capacity. An incompatible Enhancement on a feature-granted weapon is repaired through its owning answer and generated projection together; losing a paid slot never removes a free Enhancement. Generated weapon ranks still follow their grant, and direct projection edits retain ownership checks.

## Cross-location review

| Area | Verified behavior |
| --- | --- |
| Skills and level changes | A skill decrease, including a level-driven cap reduction, reviews weapons that lose their minimum rank. |
| Transitive dependencies | One review lists the affected weapon, dependent Feat, Class option and Technique; attached Enhancements disappear with their weapon. |
| Rank and capacity | Legal lower weapon ranks survive; incompatible/excess Enhancements are reviewed. Alternative governing skills can preserve the weapon without a prompt. |
| Feature-owned equipment | Capacity and prerequisite removals update the answer and generated weapon consistently; free Enhancements and grant-defined weapon ranks retain their distinct rules. |
| Other migrated domains | Existing graph/session regressions continue to cover Trait/tag/provider loss, Origin/Skill consequences, Attribute budgets, Bonds and source-owned answers. No page-specific removal path was added. |
| Invalid state | Missing catalogue references, malformed state and ownership violations remain specific errors. Direct weapon-slot over-allocation retains its existing validation; this change addresses consequences of changing supporting choices. |

## Verification

Preflight: 517 unit tests. Eight controlled regressions exercise the real page/session proposal path, cancellation, exact acceptance/save snapshots, immutable input and idempotence. The original minimum-rank, capacity and source-owned prerequisite failures were reproduced before their fixes. The final workspace suite passes 525 unit tests, 20 emulator tests and asset validation. An isolated checkout containing only this feature over HEAD passes 516 unit tests, the ten-artifact production baseline and all 14 tracked HTML pages. Nine consistency tests and an ignored browser fixture account for the workspace difference. Full-suite and browser results are also recorded in [status.md](status.md).

Authenticated browser review uses the local-only disposable character `ws7alHpyR1JZ4nk9ysqq`: Ranged Weapons 1 → 0 opens “Apply this change?” and lists “Weapon: Shuriken”; Cancel restores rank 1; Apply Change sets rank 0; Save/reload preserves rank 0 and Equipment shows no weapons. Reader/writer verification confirms the saved removal and that the user's source character is unchanged. The reviewed character remains available at `http://localhost:5028/builder/builder-skills.html?charId=ws7alHpyR1JZ4nk9ysqq`.

Evidence is ignored under `.staging/dependency-review-{preflight,red,source-red,focused,test-all}.log` and `.staging/dependency-review-browser.json`. No source cells, production artifacts or production deployment changed. Broader `WPE-DOMAIN-MIGRATION` acceptance remains active; `WPF-UI-SYSTEM` subsequently consolidates shared controls, accessibility and navigation. Production release remains a separate explicit instruction.
