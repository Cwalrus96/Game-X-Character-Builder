# Character sheet customization · September 29, 2026

The sheet now starts with black text, white backgrounds and simple black borders for every class. Automatic class palettes, heading glyphs and decorative glows are removed. A gear in Character Information opens a compact, keyboard-accessible settings window. Changes preview immediately and use the existing automatic save/status/retry/navigation flow.

Players can choose text, border, page, panel and heading-background colors, five installed-font families, three text sizes and three corner styles. Color controls accept swatches or exact six-digit hex text; incomplete/invalid input leaves the last accepted color intact. A low-contrast hint and a fixed readable settings palette make recovery possible. Reset restores neutral defaults for this character. Controls stay disabled until the character loads; Escape/close returns focus to the gear. The panel fits a 390px phone viewport, including with larger text, and printing hides it.

Six dice themes are available to all characters: Classic, Magical Girl, Spirit Warrior, Ninja, Mech Pilot and Elementalist. The Magical Girl theme has star pips and a short star/heart particle burst. Dice animation and particles are separately optional, saved per character, and respect reduced motion. A labelled deterministic sample previews the style without rolling or adding history. Actual styles consume no randomness, preserve each resolved face and coin side, and do not change Hits, TN results, damage or resources. History and changes to TN/style never animate or reroll an old result. Particles are decorative, pointer-transparent and absent for zero dice/no-roll results.

## Persistence and compatibility

Preferences are optional validated leaves of `builder.sheet.appearance`, not local storage or class state. The exact schema-6 codec accepts this additive presentation record; old characters remain unchanged on read. Migrations and ordinary builder saves preserve it. The existing sheet coordinator tracks only changed preferences, and an older completed save cannot clear a newer edit. The existing writer transaction advances revision for patches containing preferences, so a stale builder replacement is rejected. Independent preference leaf edits preserve other settings. Owner/GM authorization is unchanged. Temporary-only saves still use the established sheet compatibility path; broader session migration is outside this feature.

## Verification

- Preflight: 654 unit tests, ten unchanged reviewed game-data artifacts and 15 HTML asset checks.
- Full workspace suite: 663 unit tests, 22 Firestore/Storage emulator tests and 15 HTML asset checks. Nine new unit regressions and one authenticated persistence regression cover defaults, invalid values, exact leaf ownership, pending-save acknowledgement, codec/migration/builder preservation, character isolation, stale revisions, unauthorized writes and cosmetic parity for every dice theme.
- The isolated staged package passes 655 unit tests, 22 emulator tests and 14 tracked HTML asset checks, excluding unrelated work. Whitespace checks and the ten-artifact production-data baseline pass.
- Authenticated disposable local characters verify live preview, save/reload, neutral default, invalid input, low-contrast recovery, font/corners/text size, reset persistence, separate character settings, Magical Girl particles, animation/effects persistence, quick attacks and late TN. A 390px viewport check exposed and fixed scrollbar-related window overflow and a long technique source badge; document width now equals available viewport width at large text size.
- Production game data is unchanged. No new library, remote font or image dependency is required. Current production has not been changed by this feature; the prior release authorization is complete.

The broader `WPE-DOMAIN-MIGRATION` acceptance remains open. `WPF-UI-SYSTEM` is the subsequent cross-site consistency/accessibility/navigation work; this bounded settings feature does not complete it. Production publication remains a separate explicit instruction.

## Pip alignment and preview correction

The follow-up fixes uneven pip positions caused by star pips increasing the minimum size of occupied grid tracks. All faces now retain equal tracks regardless of pip shape or occupancy. The preview's hand-written `5 → 1 Hit` sample is replaced by a deterministic result from the same Roll Rules as actual rolls: 5 and 6 each give 2 Hits, 2 gives 0 Hits, and the displayed half-die gives 1 Hit. Actual roll scoring was already correct and is unchanged. A regression imports the sample used by the settings widget and verifies its outcomes across all themes.

Verification passes 664 workspace unit tests, 22 emulator tests and 15 HTML asset checks; the ten-artifact baseline remains unchanged. The isolated amended package passes 656 unit tests and 14 tracked-page asset checks. Browser measurements cover 108 rendered faces across all six themes: equal row/column tracks, identical centers for matching pip positions, no pip overflow, and correct preview Hit labels. This correction remains local and amends the customization feature.

## Production release

The user's “Ship it - quickly!” instruction authorized release of the tested customization feature and pip/preview corrections. Commit `9a904fc` was pushed to the existing remote branch and deployed to Firebase Hosting from the isolated tested package. All 172 live files match the package byte for byte, including the unchanged ten game-data artifacts. The production sign-in page loads with no browser warnings/errors. Authenticated production character interaction was not performed; save/reload and authorization were verified locally. No Rules, Functions, source-data publication or production character edits were included. Verification evidence is retained in ignored `.staging/customization-live-verification.json` and `.staging/customization-hosting-deploy.log`. The previous Hosting release remains available for rollback.
