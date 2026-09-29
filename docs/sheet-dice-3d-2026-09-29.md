# Animated Character Sheet dice — September 29, 2026

The Character Sheet now presents each existing d6 result as a six-sided CSS 3D cube with pips, perspective, shading, a short tumble and two settling bounces. A half die is a gold 0/1 coin with a matching flip. Individual Hits remain labelled below the dice, and the total, optional TN and damage bands remain immediately usable in the compact lower-right window.

## Behavior and boundaries

`dice-view.js` is a presentation component. Roll Rules and the cryptographic random adapter still generate the only result; animation consumes no randomness and changes no mechanics. Each cube's inverse face rotation lands the authoritative result toward the viewer. The ten-die cap, independent half coin, automatic overflow Hits and zero-pool behavior are preserved. Zero pools and no-roll effects create no decorative dice. An animation lasts 850ms plus at most 220ms of stagger.

Only a new roll animates. Revisiting history restores its existing faces and TN without animation; editing TN does not rebuild the dice. The Animate dice checkbox disables animation for the current sheet session, and the device's reduced-motion setting disables it automatically. A media-query change immediately stops in-flight motion. CSS owns the finite animation lifecycle, so there are no delayed result callbacks or simulation state that could overwrite a newer roll. Results still work if animations are disabled or not supported.

The renderer has no dependency or remote asset downloads. It imports no persistence or random adapter. The roller remains outside the sheet's save collection, with no named/save-owned inputs and no character writes. Existing Attribute/Skill, Quick Roll and Roll with Modifiers entry points use the same component. HP adjustments, source-independent acquisition, ownership and damage Rules are unchanged.

## Verification

Preflight: **627 unit tests**. Five new controlled tests cover all six face normals and pip counts, exact outcomes/no extra RNG or mutation, both coin sides beyond the ten-die cap, zero/no-roll behavior, and coin-only/static presentation. Full workspace verification passes **632 unit tests, 21 emulator rule tests and 15 HTML asset checks**. Published-data integration passes **3 tests** across the current selectable classes, weapons and supported attribute levels.

Authenticated local browser review verifies tumbling/settled cubes, a 10d6 + coin + automatic-Hit pool, the coin's matching side, unchanged faces with a late TN, history restored without animation, the session motion toggle, fresh Quick Roll defaults, and the 390px layout. Browser warnings/errors are empty on the canonical review fixture. Exact local-emulator readback confirms the saved character is unchanged after all rolls and controls. The screenshot is delivered in the chat's outputs directory.

The production release uses committed files only, excluding pre-existing unrelated edits and ignored local catalogue/fixture files. Before release, all ten live production JSON artifacts matched the checked-in reviewed baseline byte-for-byte. The user's September 29 request to push changes remotely for players tonight authorizes this Firebase Hosting website release, including the previously committed HP, rolling and consistency improvements. It supersedes the local-only website hold for this release; it does not authorize source-data publishing, Rules, Functions or database changes. Deployment outcome and isolated-release results are recorded in `docs/status.md` and the release follow-up below.

Logs: `.staging/dice-3d-preflight.log`, `.staging/dice-3d-full.log`, `.staging/dice-3d-data.log`. Broader `WPE-DOMAIN-MIGRATION` acceptance remains separate; the subsequent `WPF-UI-SYSTEM` work consolidates controls, accessibility and navigation.

The isolated release package passes **624 unit tests, 3 published-data integration tests, 14 tracked HTML asset checks and the ten-artifact baseline**. It excludes the eight unrelated workspace regressions and ignored local review page. Evidence: `.staging/dice-3d-release-unit.log` and `.staging/dice-3d-release-data.log`.

## Production release

On September 29, code commit `cbb87e7` was deployed successfully to **https://game-x-character-builder.web.app** using Firebase Hosting only, from `.staging/dice-3d-release`. The deployment uploaded 165 public files, finalized the version and completed the release. The release includes the committed signed HP controls, Character Sheet rolling, technique layout and source-consistency fixes, along with animated dice. Evidence: `.staging/dice-3d-deploy.log`.

After deployment, HTTP reads and SHA-256 comparisons verified **all 165 live files byte-for-byte** against the tested release export. The ten production game-data artifacts remain unchanged. Live browser review reached the normal signed-out login page with no console warnings or errors. Authenticated production character interaction was not exercised; functional character checks used the authenticated local emulator and the identical deployed website assets. No Rules, Functions, source cells or production character records were modified.
