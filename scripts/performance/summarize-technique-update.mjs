// Dated comparison evidence. Preserve the original baseline and every raw row.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const rows = async path => (await fs.readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const cleanTabStart = '2026-09-30T16:33:49.381Z';
const extendedUseStart = '2026-09-30T16:36:35.655Z';
const verificationStart = '2026-09-30T16:37:00.000Z';
function summaries(raw, phaseFor) {
  const groups = new Map();
  for (const row of raw) {
    if (row.id.startsWith('click:')) continue;
    const key = [phaseFor(row), row.page, row.id, row.from || '', row.id === 'page-ready' ? row.navigationType : ''].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.durationMs);
  }
  return [...groups].map(([key, samplesMs]) => {
    const sorted = [...samplesMs].sort((a,b) => a-b), n=sorted.length;
    return {key, n, medianMs: +(n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2).toFixed(2),
      minMs: sorted[0], maxMs: sorted.at(-1), samplesMs};
  });
}
const baseline = await read('docs/benchmarks/2026-09-29-baseline.json');
const currentManifest = await read('.staging/performance-update-final/manifest.json');
const controlManifest = await read('.staging/performance-update-control/manifest.json');
assert.deepEqual(Object.keys(controlManifest.files).sort(), Object.keys(baseline.manifest.files).sort());
const controlLineEndingDifferences = [];
for (const [name, hash] of Object.entries(controlManifest.files)) {
  if (hash === baseline.manifest.files[name]) continue;
  // git archive writes repository line endings; the Windows baseline includes
  // mixed working-tree endings. Prove unchanged content, not just filenames.
  assert.equal(currentManifest.files[name], baseline.manifest.files[name], `${name} is not an unchanged baseline reference`);
  const archived = await fs.readFile(`.staging/performance-old-code/public/${name}`, 'utf8');
  const reference = await fs.readFile(`public/${name}`, 'utf8');
  assert.equal(archived.replaceAll('\r\n', '\n'), reference.replaceAll('\r\n', '\n'), `${name} differs beyond line endings`);
  controlLineEndingDifferences.push(name);
}
const changedFiles = Object.keys(currentManifest.files).filter(key => currentManifest.files[key] !== baseline.manifest.files[key]);
assert.deepEqual(changedFiles.sort(), ['js/builder/builder-techniques.js', 'js/builder/widgets/technique-choice-widget.js', 'js/builder/widgets/techniques-widget.js']);
for (const [name, hash] of Object.entries(currentManifest.files)) {
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(`public/${name}`)).digest('hex'), hash, `${name} changed during measurement`);
}
const updatedRaw = await rows('.staging/performance-update-final/browser.jsonl');
const controlRaw = await rows('.staging/performance-update-control/browser.jsonl');
const initialProbe = await rows('.staging/performance-update-pass1/browser.jsonl');
const core = await read('.staging/performance-update-final/core.json');
assert.equal(core.fixtureSha256, baseline.core.fixtureSha256);
assert.equal(core.catalogueSha256, baseline.core.catalogueSha256);
const report = {
  schemaVersion: 1, title: 'Technique catalogue performance update — September 30, 2026',
  baseline: '2026-09-29-baseline.json', changedFiles, currentManifest, controlManifest, controlLineEndingDifferences,
  method: 'Same fixture, catalogue, machine, browser/version/viewport and observer. Serial local emulator actions. Matched original-code control served from git e0a4e3f on port 5029; updated code on 5027. No production requests or writes.',
  browser: {
    cleanTabStart, extendedUseStart, verificationStart,
    phaseNote: 'Initial tab showed a roughly fourfold slowdown after a read-only browser evaluation; unchanged Attributes also slowed. Cause is not established. This phase is retained separately. Original-code control and clean updated tab used snapshots/locators without page evaluation. No observed crash. Longer control/save actions exceeded browser-tool deadlines but completed; each dispatched action was awaited and never retried blindly.',
    updatedSummaries: summaries(updatedRaw, r => r.at < cleanTabStart ? 'initial-session' : r.at < extendedUseStart ? 'clean-session' : r.at < verificationStart ? 'extended-use' : 'verification'),
    controlSummaries: summaries(controlRaw, () => 'original-code-control'),
    updatedRaw, controlRaw, initialProbe,
  },
  core, verification: await read('.staging/performance-update-final/verification.json'),
};
await fs.writeFile('docs/benchmarks/2026-09-30-technique-update.json', JSON.stringify(report,null,2)+'\n');
for (const row of [...report.browser.updatedSummaries, ...report.browser.controlSummaries]) console.log(JSON.stringify(row));
