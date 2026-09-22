# Class availability and Soulbound weapon repair

The Class page previously displayed a count of unavailable options without identifying their reasons, even when the reason was content readiness rather than prerequisites. Its unavailable toggles now start unchecked. Unavailable choices and empty option-group headings stay hidden; explicit opt-in shows the individual disabled choices and reasons. Selected choices remain inspectable. The aggregate message is removed.

The Weapon Master picker was still constructing the old partial answer format. A new weapon lacked required canonical fields/source ownership, and its display-form tags failed schema-v6 validation. Optional enhancements also omitted their required `granted` flag. The input adapter now supplies complete answers, preserves the granting owner, normalizes compatibility tags, and retains the forced Soulbound enhancement. Rules continue deriving actual weapon tags from catalogue definitions.

Clearing an answer now deletes that specific source-owned answer. The compiler requires the answer to exist before linking its generated weapon to an owner node; reconciliation can then present dependent removals instead of rejecting a dangling graph edge. Cancellation leaves accepted state unchanged.

## Verification

- Three synthetic-fixture regressions exercise fresh weapon input through codec/session/save snapshot, forced and optional enhancements with preserved ownership, and clear/cancel reconciliation. They do not depend on spreadsheet content.
- Full workspace verification passed 456 unit tests, 20 Firebase emulator tests and 14 asset checks. Three installed-catalogue checks and the ten-artifact baseline passed. The concurrent workspace contains separately developed feat/readiness work; the released package was therefore verified independently in the browser.
- The isolated 128-file package at `http://localhost:5023/` uses local Firebase. A level-2 Weapon Master selected Longsword, Defensive and Blademaster Style, then saved/reloaded all three. Clearing the weapon presented dependent removals; cancellation retained them. A level-12 Metamorph started with unchecked toggles and no unavailable-count or empty-group heading; explicit opt-in revealed reasons, and switching it off hid them again.
- No new signed-in Class console errors occurred. Initial unauthenticated redirects logged the existing “Not signed in” message; the local character list logged an unrelated missing copied-portrait warning.

## Release

Hosting version `8b3b69e716608705` released at `2026-09-22T23:19:49.292Z`. All 128 package files match Hosting's hashes and public HTTP readback; the ten data artifacts and serving configuration are unchanged. The rollback version is `0b5a7124566ffee7`. Deployment is limited to eleven Class/widget/graph application paths under the user's continuing website-release authorization. No source cells, production characters, Rules or Functions were modified.

The package was built on the actual prior live release, excluding concurrent feat-picker, feature-ordering and required-cell readiness work. Its retained pooled Feats view receives the same unchecked default. Those separate changes keep their own release scope. Ignored manifests, test logs, deployment log and public verification are under `.staging/builder-availability/`.

The remaining named step is `WPE-DOMAIN-MIGRATION`: finish supported missing mechanics and retire compatibility helpers while retaining save/dependency guarantees. `WPF-UI-SYSTEM` follows to consolidate portable controls, accessibility and navigation; neither is completed by these two bug fixes. Personal acceptance remains a nonblocking follow-up.
