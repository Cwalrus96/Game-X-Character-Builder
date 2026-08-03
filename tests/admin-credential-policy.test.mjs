import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertCredentialOutsideRepository,
  buildGmCustomClaims,
  isPathInsideDirectory,
  parseSetGmArgs,
} from "../scripts/admin/credential-policy.mjs";

test("credential policy rejects repository-owned paths", () => {
  const repository = path.resolve("C:/projects/game-x");
  assert.equal(isPathInsideDirectory(repository, path.join(repository, "admin/key.json")), true);
  assert.throws(
    () => assertCredentialOutsideRepository(repository, path.join(repository, "admin/key.json")),
    /inside the repository/,
  );
});

test("credential policy accepts external paths", () => {
  const repository = path.resolve("C:/projects/game-x");
  const external = path.resolve("C:/credentials/game-x-admin.json");
  assert.equal(isPathInsideDirectory(repository, external), false);
  assert.equal(assertCredentialOutsideRepository(repository, external), external);
});

test("GM claim updates preserve unrelated custom claims", () => {
  assert.deepEqual(
    buildGmCustomClaims({ campaignAdmin: true, tier: "founder" }, true),
    { campaignAdmin: true, tier: "founder", gm: true },
  );
  assert.deepEqual(
    buildGmCustomClaims({ campaignAdmin: true, gm: true }, false),
    { campaignAdmin: true },
  );
});

test("set-gm arguments require explicit valid inputs", () => {
  assert.deepEqual(
    parseSetGmArgs(["Person@Example.com", "true", "--project-id", "game-x-prod", "--dry-run"]),
    {
      help: false,
      dryRun: true,
      projectId: "game-x-prod",
      email: "person@example.com",
      enabled: true,
    },
  );
  assert.throws(() => parseSetGmArgs(["person@example.com", "yes"]), /true or false/);
  assert.throws(() => parseSetGmArgs(["not-an-email", "true"]), /valid user email/);
});
