import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fetchRuntimeGameData } from "../public/js/core/local-game-data.js";
import { installLocalGameData } from "../scripts/local-game-data.mjs";
import { expectedRuntimeArtifacts } from "../scripts/game-data/publisher.mjs";
import { GRAPH_GAME_DATA } from "./fixtures/graph-core.mjs";

test("local data override is loopback-only and a missing candidate uses the published catalogue", async () => {
  for (const hostname of ["localhost", "127.0.0.1", "example.com"]) {
    const requests = [];
    const fetchImpl = async (url) => { requests.push(url.pathname); return { ok: true, json: async () => ({ local: url.pathname.startsWith("/local-review/") }) }; };
    const result = await fetchRuntimeGameData(new URL(`http://${hostname}/data/game-x/game-x-data.json`), { fetchImpl });
    assert.equal(result.local, hostname !== "example.com");
    assert.equal(requests.length, 1);
  }
  const paths = [];
  await fetchRuntimeGameData(new URL("http://localhost/data/game-x/game-x-data.json"), { fetchImpl: async (url) => {
    paths.push(url.pathname);
    return paths.length === 1 ? { ok: false, status: 404 } : { ok: true, json: async () => ({}) };
  } });
  assert.deepEqual(paths, ["/local-review/game-x-data.json", "/data/game-x/game-x-data.json"]);
  await assert.rejects(fetchRuntimeGameData(new URL("http://localhost/data/game-x/game-x-data.json"), { fetchImpl: async () => ({ ok: false, status: 500 }) }), /local review/);
});

test("local installation verifies the complete staging run before writing and rejects tampering", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-local-data-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = path.join(root, "run"), outputDirectory = path.join(root, "review");
  await fs.mkdir(path.join(run, "artifacts"), { recursive: true });
  const source = JSON.parse(await fs.readFile(new URL("../contracts/game-data-source.json", import.meta.url)));
  const gameData = { ...structuredClone(GRAPH_GAME_DATA), weaponBases: [], weaponEnhancements: [] };
  const artifacts = [];
  for (const name of expectedRuntimeArtifacts(2)) {
    const bytes = Buffer.from(JSON.stringify(name === "game-x-data.json" ? gameData : []));
    await fs.writeFile(path.join(run, "artifacts", name), bytes);
    artifacts.push({ name, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const records = {
    "source-provenance.json": { fileId: source.fileId, xlsxSha256: "fixture" },
    "artifact-diff.json": {},
    "validation-report.json": { validation: { ok: true }, runtimeLoadAcceptance: { ok: true }, modelSha256: "model", source: { xlsxSha256: "fixture" } },
    "export-report.json": { runtimeLoadAcceptance: { ok: true }, modelSha256: "model", source: { fileId: source.fileId }, runtimeArtifactSchemaVersion: 2, artifacts },
  };
  for (const [name, record] of Object.entries(records)) await fs.writeFile(path.join(run, name), JSON.stringify(record));
  assert.equal((await installLocalGameData(run, { outputDirectory })).artifactCount, 9);
  const before = await fs.readFile(path.join(outputDirectory, "game-x-data.json"), "utf8");
  await fs.writeFile(path.join(run, "artifacts", "classes.json"), "tampered");
  await assert.rejects(installLocalGameData(run, { outputDirectory }), /does not match/);
  assert.equal(await fs.readFile(path.join(outputDirectory, "game-x-data.json"), "utf8"), before);
  records["validation-report.json"].validation.ok = false;
  await fs.writeFile(path.join(run, "validation-report.json"), JSON.stringify(records["validation-report.json"]));
  await assert.rejects(installLocalGameData(run, { outputDirectory }), /complete validated/);
});

test("local review files cannot be included in a Hosting deploy", async () => {
  const config = JSON.parse(await fs.readFile(new URL("../firebase.json", import.meta.url)));
  assert.ok(config.hosting.ignore.includes("local-review/**"));
});
