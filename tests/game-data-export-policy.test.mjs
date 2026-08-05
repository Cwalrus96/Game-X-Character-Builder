import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertGameDataExportTargetAllowed,
  PRODUCTION_DATA_DIRECTORY,
  PRODUCTION_EXPORT_STATUS,
  resolvePathThroughExistingAncestor,
} from "../scripts/game-data-export-policy.mjs";

test("production game-data exports remain frozen before Work Package B", () => {
  assert.equal(PRODUCTION_EXPORT_STATUS, "frozen");
  assert.throws(
    () => assertGameDataExportTargetAllowed(PRODUCTION_DATA_DIRECTORY),
    /Production game-data export is frozen/,
  );
  assert.throws(
    () => assertGameDataExportTargetAllowed(path.join(PRODUCTION_DATA_DIRECTORY, "nested")),
    /Production game-data export is frozen/,
  );
});

test("game-data exporter may still write to a staging directory", () => {
  assert.doesNotThrow(() => assertGameDataExportTargetAllowed(
    path.resolve(PRODUCTION_DATA_DIRECTORY, "..", "game-x-staging"),
  ));
});

test("production freeze resolves existing junctions before approving staging", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "game-x-export-policy-"));
  const production = path.join(temporaryRoot, "production");
  const stagingLink = path.join(temporaryRoot, "staging-link");
  fs.mkdirSync(production);
  try {
    try {
      fs.symlinkSync(production, stagingLink, "junction");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("This Windows account cannot create a test junction.");
        return;
      }
      throw error;
    }
    assert.equal(resolvePathThroughExistingAncestor(path.join(stagingLink, "nested")), path.join(production, "nested"));
    assert.throws(
      () => assertGameDataExportTargetAllowed(path.join(stagingLink, "nested"), {
        productionDataDirectory: production,
      }),
      /Production game-data export is frozen/,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
