# Character-sheet formatting audit · September 29, 2026

The previous Heading Background fix covered Technique titles but missed other title structures. Traits used shared `h3` markup, derived weapons used plain headings, and Feats/Class Features remained in read-only input/textarea controls. Sheet-only CSS now supplies the same title background, heading font, padding, border, wrapping and spacing to each named card or subsection, without changing the shared builder renderers.

## Change boundaries

| Modification | Applies to | Deliberately does not affect |
| --- | --- | --- |
| Consistent title surfaces | Feats, Class/Origin Features, custom abilities, Traits, ordinary and Trait-granted weapons, weapon attacks, Techniques, Bonds, Keystones, skill labels, subsection titles, Rank 0 disclosure and Enhancement summaries. Existing section/attribute/table headings retain their corresponding title surface; phone resource labels now do too. | Card bodies, descriptions, ranks, source/tag chips, roll/action columns, input fields, settings recovery colors, builder pages and game mechanics. Source/tag chips are metadata, not cards with separate title/body areas. |
| Read-only ability presentation | Names are semantic wrapping headings; complete descriptions preserve newlines and display as plain text. Feats, Class/Origin Features and custom abilities all use this path. Literal markup remains text. | Existing hidden backing fields and repeatable serialization remain intact. No content truncation, character mutation or alternate persistence path is introduced. |
| Corners and decoration | Attribute cards and their top headers, condition rows and phone resource cards now follow the existing corner preference. The attribute-only shadow is removed to match other neutral cards. | Settings, source/tag pills, site-wide builder styles and game rules. |
| Phone navigation | On character sheets at widths up to 680px, stacked navigation scrolls away, avoiding a large sticky overlay with OpenDyslexic and large text. | Desktop sticky navigation and all other pages. |

## Verification

- Preflight and full suite: **671 unit tests**, with full verification also passing **22 emulator tests** and **15 HTML asset checks**. Final asset validation and the ten-artifact production-data baseline pass after the phone-only CSS correction. No new mechanics or persistence schema was added.
- Authenticated disposable local fixtures cover a Henshin Hero with Feats, Class/Origin Features, Traits, weapons, Bonds and Keystones; a Weapon Master with Soulbound and two optional enhancements; and a Metamorph with an Integrated Weapon.
- Changing Heading Background updates **93 rendered headings** while leaving card bodies, controls and settings colors unchanged. Changing Panel Background updates **69 card/attribute/skill surfaces** without changing their headings. Changing the heading font updates all measured headings without changing body fonts. Square corners produce `0px` on all measured cards/attributes/skills.
- Automatic and optional Enhancement summaries share the heading color; expanded descriptions retain the panel beneath their transparent body. A Trait-granted Longsword and its attack heading match ordinary weapons, independent of acquisition source.
- At **390px**, large OpenDyslexic text has no horizontal page overflow. A long custom title wraps (293px content width, 161px height), no backing ability inputs remain visible, and displayed descriptions equal the original backing text. Mobile resource labels use Heading Background. The corrected navigation is static on phones and remains sticky on desktop.
- Saved appearance survives reload. Exact emulator readback of all three fixtures verifies that **every builder field except appearance is unchanged**. No production character was read or written during this task.

Evidence: `.staging/sheet-formatting-{preflight,test-all}.log`, `.staging/sheet-formatting-browser-audit.json`, and the task's `outputs/sheet-badge-headings-fixed.png` and `outputs/sheet-formatting-phone.png`. Preview: **http://127.0.0.1:5021/character-sheet.html?charId=formatting-kazuma-20260929**.

This new fix is local. The preceding “Deploy all changes” release is complete; no further website deployment occurred. Broader `WPE-DOMAIN-MIGRATION` acceptance and subsequent `WPF-UI-SYSTEM` controls/accessibility/navigation work remain open; this bounded sheet correction does not complete either package.
