# Campaign website release — October 1, 2026

The user explicitly authorized this release: “Push to the remote website, so I can test locally on my phone”. This supersedes the local-only deployment boundary for the current website release, including its matching Firestore/Storage rules and required portrait access configuration.

Live entry: <https://game-x-character-builder.web.app/campaigns.html>.

The immutable export of `c04a986476a3dfe50bb8517715af526ef58e79a7` includes private campaigns, one campaign per character, creator-assigned GMs and retained Super GM access. It also includes the pending Agile Weapon/Fighting Style fixes, Technique performance improvement and sheet-formatting fixes. Only committed website files were packaged; local fixtures were excluded.

## Verification and deployment

- Fresh `npm run test:all`: **709 unit tests, 34 emulator tests and 16 workspace HTML assets**, all passing. The ten-artifact production-data baseline and whitespace check pass.
- Before deployment, all ten live game-data artifacts matched the package byte for byte. No new game-data publication was performed.
- Firebase deployed Hosting, Firestore rules and Storage rules from `.staging/campaign-release-20261001-c04a986`. Both rule files compiled successfully.
- Hosting release: `sites/game-x-character-builder/releases/1790861476473000`, at `2026-10-01T13:31:16.473Z`; version `3a5c710434656f12`.
- All **196 live files** match the package SHA-256 values; JavaScript retains `Cache-Control: no-cache`. Live Firestore and Storage rule source matches the tested package, allowing only line-ending normalization.
- The Storage service agent received `roles/firebaserules.firestoreServiceAgent` for cross-service rule evaluation. The role was previously absent; its exact service-agent binding was verified afterward.
- The portrait bucket previously had no CORS configuration. It now allows GET from `https://game-x-character-builder.web.app` and `https://game-x-character-builder.firebaseapp.com`, with `Content-Type` exposed and a 3600-second preflight cache. Readback confirms the configuration. Authentication and Storage rules continue to govern access.
- A fresh signed-out browser visit to Campaigns redirects to `login.html?next=%2Fcampaigns.html`, with the Google sign-in control visible and no browser warnings/errors. Authenticated campaign creation, GM access and portraits were verified locally; no production test records were created.

Previous Hosting release metadata and both active rule sources were backed up before deployment. Evidence remains under `.staging/campaign-release-*` and `.staging/campaign-before-*`, including test/deploy logs, before/after release metadata and file hashes. Credential values were not stored in these artifacts. The first read-only release-metadata request required an explicit quota-project header; the corrected requests succeeded before deployment.

No production character documents, custom claims, canonical source cells, Functions or indexes were modified. The worktree was initially clean. This release authorization does not authorize later deployments or game-data publication.

The next manual action is phone testing through the live URL. Broader `WPE-DOMAIN-MIGRATION` remains active: finish compatibility and character save/reload/dependency acceptance before `WPF-UI-SYSTEM` consolidates controls, accessibility and navigation. Their source-edit and future-release approval boundaries remain separate.
