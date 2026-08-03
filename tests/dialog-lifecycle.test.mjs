import assert from "node:assert/strict";
import test from "node:test";

import {
  createDialogLifecycle,
  restoreDialogFocus,
} from "../public/js/core/dialog-lifecycle.js";

test("dialog lifecycle supersedes an active request without leaving it unresolved", async () => {
  const events = [];
  const lifecycle = createDialogLifecycle({
    onOpen: (context) => {
      events.push(["open", context.id]);
    },
    onClose: (context, detail) => {
      events.push(["close", context.id, detail.result, detail.reason]);
    },
  });

  const firstResult = lifecycle.request({ id: "first" });
  const secondResult = lifecycle.request({ id: "second" });

  assert.equal(await firstResult, false);
  assert.equal(lifecycle.getActiveContext().id, "second");
  assert.equal(lifecycle.settle(true, { reason: "accept" }), true);
  assert.equal(await secondResult, true);
  assert.equal(lifecycle.getActiveContext(), null);
  assert.deepEqual(events, [
    ["open", "first"],
    ["close", "first", false, "superseded"],
    ["open", "second"],
    ["close", "second", true, "accept"],
  ]);
});

test("dialog lifecycle settles each request only once", async () => {
  let closes = 0;
  const lifecycle = createDialogLifecycle({
    onClose: () => {
      closes += 1;
    },
  });

  const result = lifecycle.request({ id: "escape-test" });
  assert.equal(lifecycle.settle(false, { reason: "escape" }), true);
  assert.equal(lifecycle.settle(true, { reason: "late-accept" }), false);
  assert.equal(await result, false);
  assert.equal(closes, 1);
});

test("dialog lifecycle fails closed if opening the UI throws", async () => {
  const events = [];
  const lifecycle = createDialogLifecycle({
    onOpen: () => {
      throw new Error("Dialog unavailable");
    },
    onClose: (_context, detail) => {
      events.push(detail);
    },
  });

  assert.equal(await lifecycle.request({ id: "broken" }), false);
  assert.equal(lifecycle.getActiveContext(), null);
  assert.deepEqual(events, [{
    result: false,
    reason: "open-error",
  }]);
});

test("dialog focus returns to the opener except when a request is superseded", async () => {
  const focusCalls = [];
  const opener = {
    isConnected: true,
    focus: (options) => focusCalls.push(options),
  };

  assert.equal(restoreDialogFocus(opener, { reason: "accept" }), true);
  await Promise.resolve();
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);

  assert.equal(restoreDialogFocus(opener, { reason: "superseded" }), false);
  assert.equal(restoreDialogFocus({ ...opener, isConnected: false }), false);
  await Promise.resolve();
  assert.equal(focusCalls.length, 1);
});
