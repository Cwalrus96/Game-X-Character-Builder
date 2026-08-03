import assert from "node:assert/strict";
import test from "node:test";

import { getSaveStatusPresentation } from "../public/js/core/save-status.js";

test("failed dirty saves remain visibly actionable", () => {
  const error = new Error("Firestore is unavailable");
  assert.deepEqual(getSaveStatusPresentation({
    status: "error",
    dirty: true,
    saving: false,
    error,
  }), {
    status: "error",
    message: "Save failed. Changes are still unsaved.",
    busy: false,
    title: error.message,
    retryVisible: true,
    retryDisabled: false,
  });
});

test("loading failures do not offer a meaningless save retry", () => {
  const presentation = getSaveStatusPresentation({
    status: "error",
    dirty: false,
    error: new Error("Character could not be loaded"),
  });
  assert.equal(presentation.message, "Could not load character.");
  assert.equal(presentation.retryVisible, false);
});

test("saving state is announced as busy", () => {
  const presentation = getSaveStatusPresentation({ status: "saving", dirty: true, saving: true });
  assert.equal(presentation.message, "Saving...");
  assert.equal(presentation.busy, true);
  assert.equal(presentation.retryDisabled, true);
});
