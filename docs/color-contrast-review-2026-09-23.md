# Shared text contrast review — September 23, 2026

The Attributes page's zero-remaining value was white on pale green because `.pill strong` overrode the status pill's dark foreground. Bold values now inherit their pill's foreground across every builder widget. Success stays dark green on pale green, danger stays dark red on pale red, and neutral pills retain light text on dark backgrounds.

The follow-through covers the shared builder/site styles and every character-sheet theme. It changes presentation only; Rules, selection, commands, save behavior and stored characters are unchanged.

## Corrections and measurements

Ratios use rendered computed colors, alpha-composited solid backgrounds and WCAG relative luminance. The reference is [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for ordinary text, 3:1 for large text. Disabled controls and decorative glyphs are excluded from text measurements.

| Surface | Before | After / decision |
| --- | --- | --- |
| Zero-remaining bold value | 1.04:1 | 7.26:1, inherits the success foreground |
| Overspent bold value | 1.11:1 | 8.01:1, inherits the danger foreground |
| Builder errors on light cards | 1.06:1 | 8.01:1; explicit dark-red/pale-red pair also works in dark headers |
| Primary buttons and accent badges | 4.09–4.32:1 | 5.95–6.30:1; darker shared red retains light labels on builder, Characters, sign-in and GM pages |
| Builder untrained label | 4.02:1 | 5.85:1 using the darker accent |
| Unavailable-option explanation | 4.15:1 | 5.82:1 using the existing muted card-text token |
| Elementalist section headings | Several below 3:1, including gold at 1.81:1 | All seven use dark text; 4.77–9.68:1, preserving each colored background |
| Sheet source badges, empty skills and footer | Gold/orange/violet accents were too faint on light surfaces | Panel labels use panel text; footer uses body text, matching its outer-sheet background |
| Weapon metadata | Fixed gray was too dark on dark panels (2.95–3.35:1) | Uses the theme's panel text |
| Portrait placeholder/remove button | Theme colors could be pale on the fixed white portrait surface | Explicit dark gray paired with the white surface |
| Sheet placeholders | Accent colors were too faint in light themes; default gray condition placeholders measured 3.62:1 on Metamorph | All sheet input placeholders and textarea placeholders use panel text at full opacity |
| Sheet save/retry states | Theme panel colors were inherited over the dark page exterior | Explicit dark surface/light text; error retains light red; keyboard-focused retry is 15.89:1 |

Decorative theme accents remain available for borders and flourishes; they are no longer assumed to be readable text colors. Error text and status labels still communicate state independently of color.

## Verification and scope

- Preflight: `npm test` — **517 unit tests passed**.
- Full workspace: `npm run test:all` — **517 unit tests, 20 emulator tests, 14 asset checks passed**. Final placeholder consolidation also passes the 14 asset checks.
- `npm run baseline:data` — all **10 production artifacts unchanged**. `git diff --check` passes.
- Browser matrix: **16 fixture pages / 699 rendered text samples**, using the actual local CSS: shared builder states, Characters, sign-in, GM, neutral sheet, all ten class themes and the legacy Technologist alias. All **688 solid-background samples** meet their text threshold (the lowest is 4.61:1). Eleven gradient-backed samples are estimates and are not claimed as precise contrast measurements; representative layouts were visually inspected.
- The matrix includes neutral/success/danger pill labels and bold values, errors/warnings on light and dark surfaces, ordinary/secondary/danger buttons, helper text, unavailable-option explanations, all seven Elementalist headers, sheet badges/metadata/footer, portrait text, input/textarea placeholders, and idle/saving/error/retry states. Keyboard focus on Retry verifies its shared hover/focus color pair.
- Authenticated browser review of the actual Attributes page confirms **Remaining: 0** uses `#17603d` on `#ebfff5`. The actual Metamorph sheet confirms readable condition placeholders, metadata and save status. No character input or save was performed. The review copy's existing missing-primary warning remains visible and is unrelated to contrast.

Fresh no-cache local review: **http://localhost:5028/builder/builder-attributes.html?charId=OkolV60rpCO07Awul9ua**. The same edited public files are served by the existing localhost:5000 emulator. The separate review origin avoids stale modules cached by the in-app browser. Ignored fixtures/server: `.staging/contrast/server.mjs`; logs: `.staging/contrast-preflight.log`, `.staging/contrast/test-all.log`.

This is a targeted contrast repair and cross-theme review, not a complete accessibility certification of every interactive state. Remaining supported-domain acceptance stays under `WPE-DOMAIN-MIGRATION`. The next named step, `WPF-UI-SYSTEM`, consolidates shared controls/CSS ownership and accessibility/navigation after that acceptance; this repair establishes the foreground/background policy without completing that broader step. Production deployment and the separate full data release still require explicit authorization. Pre-existing instruction-consistency work remains separate.
