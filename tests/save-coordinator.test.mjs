import assert from "node:assert/strict";
import test from "node:test";

import { createSaveCoordinator } from "../public/js/core/save-coordinator.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("save coordinator serializes and coalesces edits made during a save", async () => {
  const saves = [deferred(), deferred()];
  const revisions = [];
  let activeSaves = 0;
  let maxActiveSaves = 0;
  const coordinator = createSaveCoordinator({
    debounceMs: 60000,
    save: async ({ revision }) => {
      const saveIndex = revisions.length;
      revisions.push(revision);
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      await saves[saveIndex].promise;
      activeSaves -= 1;
    },
  });

  coordinator.markDirty();
  const firstFlush = coordinator.flush();
  await Promise.resolve();
  assert.deepEqual(revisions, [1]);

  coordinator.markDirty();
  const secondFlush = coordinator.flush();
  assert.equal(maxActiveSaves, 1);
  assert.equal(coordinator.getState().dirty, true);
  assert.equal(coordinator.getState().saving, true);

  saves[0].resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(maxActiveSaves, 1);

  saves[1].resolve();
  assert.equal(await firstFlush, true);
  assert.equal(await secondFlush, true);
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(coordinator.getState().status, "saved");
  assert.equal(coordinator.getState().dirty, false);
});

test("save coordinator preserves dirty state after failure and retries", async () => {
  const expectedError = new Error("Firestore unavailable");
  let attempts = 0;
  const states = [];
  const coordinator = createSaveCoordinator({
    debounceMs: 60000,
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw expectedError;
    },
    onStateChange: (state) => {
      states.push(state.status);
    },
  });

  coordinator.markDirty();
  assert.equal(await coordinator.flush(), false);
  assert.equal(attempts, 1);
  assert.equal(coordinator.getState().status, "error");
  assert.equal(coordinator.getState().dirty, true);
  assert.equal(coordinator.getState().error, expectedError);

  assert.equal(await coordinator.retry(), true);
  assert.equal(attempts, 2);
  assert.equal(coordinator.getState().status, "saved");
  assert.equal(coordinator.getState().dirty, false);
  assert.deepEqual(states, ["idle", "dirty", "saving", "error", "dirty", "saving", "saved"]);
});

test("save coordinator flushes clean state without writing", async () => {
  let attempts = 0;
  const coordinator = createSaveCoordinator({
    save: async () => {
      attempts += 1;
    },
  });

  coordinator.markClean();
  assert.equal(await coordinator.flush(), true);
  assert.equal(attempts, 0);
  assert.equal(coordinator.getState().status, "saved");
  assert.equal(coordinator.getState().dirty, false);
});
