import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const handoffFiles = [
  "AGENTS.md",
  "docs/status.md",
  "docs/roadmap.md",
  "docs/architecture.md",
  "docs/builder-flow.md",
  "docs/character-session.md",
  "docs/character-persistence.md",
  "docs/data-pipeline.md",
  "docs/game-data-contract.md",
  "docs/security.md",
];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("agent handoff entry point and living documents have no broken local links", () => {
  for (const relativePath of handoffFiles) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    assert.equal(fs.existsSync(sourcePath), true, `${relativePath} must exist`);
    const markdown = fs.readFileSync(sourcePath, "utf8");
    for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      const withoutFragment = decodeURIComponent(target.split("#", 1)[0]);
      const resolved = path.resolve(path.dirname(sourcePath), withoutFragment);
      assert.equal(
        fs.existsSync(resolved),
        true,
        `${relativePath} links to missing local target ${target}`,
      );
    }
  }
});

test("status next-step ID resolves to a ready or active stable roadmap step", () => {
  const status = read("docs/status.md");
  const roadmap = read("docs/roadmap.md");
  const match = status.match(/Next implementation step: `([^`]+)`/);
  assert.ok(match, "docs/status.md must name the next implementation step");
  const stepId = match[1];
  const heading = `### \`${stepId}\``;
  const start = roadmap.indexOf(heading);
  assert.notEqual(start, -1, `${stepId} must exist in docs/roadmap.md`);
  const next = roadmap.indexOf("\n### `", start + heading.length);
  const section = roadmap.slice(start, next === -1 ? undefined : next);
  assert.match(section, /Status: `(?:ready|active)`/);
  assert.match(section, /Acceptance:/);
});

test("source config identity and schema are repeated in the living contract", () => {
  const config = JSON.parse(read("contracts/game-data-source.json"));
  const contract = read("docs/game-data-contract.md");
  const status = read("docs/status.md");
  for (const document of [contract, status]) {
    assert.match(document, new RegExp(config.fileId));
    assert.match(document, new RegExp(`Source schema[^\\n]*${config.sourceSchemaVersion}`, "i"));
    assert.match(document, new RegExp(`Grant syntax[^\\n]*${config.grantSyntaxVersion}`, "i"));
    assert.match(
      document,
      new RegExp(`Prerequisite syntax[^\\n]*${config.prerequisiteSyntaxVersion}`, "i"),
    );
  }
  for (const sheetName of config.requiredSheets) {
    assert.ok(contract.includes(`\`${sheetName}\``), `${sheetName} must be documented`);
  }
});

test("handoff guide and roadmap state unambiguous ownership and preflight", () => {
  const agents = read("AGENTS.md");
  const roadmap = read("docs/roadmap.md");
  assert.match(agents, /CharacterSession -> Character Dependency Graph subsystem/);
  assert.match(agents, /Pages -> database reader\/writer -> Firebase/);
  assert.match(agents, /database reader\/writer -> CharacterCodec/);
  assert.match(agents, /database reader\/writer -> CharacterMigrations/);
  assert.match(agents, /do not add a duplicate repository implementation/);
  assert.doesNotMatch(agents, /GraphCompiler[^\n]*database reader\/writer/);
  assert.match(roadmap, /Standard preflight for every implementation step:/);
  assert.match(roadmap, /WPB-EXPRESSIONS[\s\S]*Step-specific preflight:/);
});

test("agent guide requires automatic plain-language briefings before and after roadmap work", () => {
  const agents = read("AGENTS.md");
  const roadmap = read("docs/roadmap.md");
  assert.match(agents, /Human-readable communication protocol/);
  assert.match(agents, /Before implementation/);
  assert.match(agents, /After implementation/);
  assert.match(agents, /should never have to prompt/);
  assert.match(agents, /Do not substitute a list of filenames/);
  assert.match(agents, /Commentary updates during implementation do not replace/);
  assert.match(roadmap, /self-contained after-implementation explanation/);
});

test("agent guide reserves mechanic formulas and limits for centralized pure Rules", () => {
  const guide = read("AGENTS.md");
  assert.match(guide, /only home for game-mechanic formulas, limits, eligibility, capacity/i);
  assert.match(guide, /Graph compilation and widgets must import the same Rules API/i);
  assert.match(guide, /must not reconstruct that arithmetic or policy locally/i);
});

test("handoff guide requires fresh review deployments and safe feature commits", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /Always redeploy ready website changes/);
  assert.match(agents, /restart\/redeploy the local Firebase review environment/);
  assert.match(agents, /Create a new commit for each new feature/);
  assert.match(agents, /current top commit, amend that top commit/);
  assert.match(agents, /never rewrite a non-top commit/);
});

test("package scripts expose acquisition, staging, reviewed publishing, and release verification", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts["data:source:check"], "node scripts/fetch-game-data-source.mjs --check");
  assert.equal(packageJson.scripts["fetch:data"], "node scripts/fetch-game-data-source.mjs");
  assert.equal(packageJson.scripts["stage:data"], "node scripts/stage-game-data.mjs");
  assert.equal(packageJson.scripts["publish:data"], "node scripts/publish-game-data.mjs");
  assert.ok(packageJson.scripts["baseline:data"]);
});
