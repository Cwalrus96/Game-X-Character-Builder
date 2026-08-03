import assert from "node:assert/strict";
import test from "node:test";

import {
  createNavigationGuard,
  installNavigationGuard,
} from "../public/js/core/navigation-guard.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

test("clean navigation leaves immediately without saving", async () => {
  let saves = 0;
  const destinations = [];
  const guard = createNavigationGuard({
    flush: async () => {
      saves += 1;
      return true;
    },
    navigate: (href) => destinations.push(href),
  });

  assert.equal(await guard.navigate("/characters.html"), true);
  assert.equal(saves, 0);
  assert.deepEqual(destinations, ["/characters.html"]);
});

test("dirty navigation waits for a successful save", async () => {
  const events = [];
  const guard = createNavigationGuard({
    flush: async () => {
      events.push("save");
      return true;
    },
    navigate: (href) => events.push(`navigate:${href}`),
  });

  guard.markDirty();
  assert.equal(await guard.navigate("/next.html"), true);
  assert.deepEqual(events, ["save", "navigate:/next.html"]);
  assert.equal(guard.getState().dirty, false);
});

test("failed or cancelled saves keep navigation blocked and state dirty", async () => {
  const destinations = [];
  const guard = createNavigationGuard({
    flush: async () => false,
    navigate: (href) => destinations.push(href),
  });

  guard.markDirty();
  assert.equal(await guard.navigate("/unsafe.html"), false);
  assert.deepEqual(destinations, []);
  assert.equal(guard.getState().dirty, true);
});

test("beforeunload is blocked only while dirty or saving", () => {
  const guard = createNavigationGuard({ flush: async () => true });
  const cleanEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  assert.equal(guard.handleBeforeUnload(cleanEvent), false);
  assert.equal(cleanEvent.prevented, false);

  guard.markDirty();
  const dirtyEvent = { prevented: false, returnValue: null, preventDefault() { this.prevented = true; } };
  assert.equal(guard.handleBeforeUnload(dirtyEvent), true);
  assert.equal(dirtyEvent.prevented, true);
  assert.equal(dirtyEvent.returnValue, true);
});

test("an external save coordinator remains the source of dirty truth", async () => {
  const state = { dirty: true, saving: false };
  const destinations = [];
  const guard = createNavigationGuard({
    getState: () => state,
    flush: async () => {
      state.saving = true;
      await Promise.resolve();
      state.saving = false;
      state.dirty = false;
      return true;
    },
    navigate: (href) => destinations.push(href),
  });

  assert.equal(await guard.navigate("/builder.html"), true);
  assert.deepEqual(destinations, ["/builder.html"]);
  assert.equal(guard.shouldBlockUnload(), false);
});

test("repeated navigation attempts share one save and one destination", async () => {
  let releaseSave;
  let saves = 0;
  const destinations = [];
  const guard = createNavigationGuard({
    flush: () => {
      saves += 1;
      return new Promise((resolve) => {
        releaseSave = resolve;
      });
    },
    navigate: (href) => destinations.push(href),
  });

  guard.markDirty();
  const first = guard.navigate("/first.html");
  const second = guard.navigate("/second.html");
  releaseSave(true);

  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(saves, 1);
  assert.deepEqual(destinations, ["/first.html"]);
});

test("installed guard intercepts ordinary same-origin links while dirty", async () => {
  const windowObject = new FakeEventTarget();
  windowObject.location = {
    href: "https://example.test/builder/page.html?charId=1",
    origin: "https://example.test",
  };
  const documentObject = new FakeEventTarget();
  const destinations = [];
  const guard = createNavigationGuard({
    flush: async () => true,
    navigate: (href) => destinations.push(href),
  });
  const binding = installNavigationGuard({ guard, windowObject, documentObject });

  const anchor = {
    href: "https://example.test/characters.html",
    target: "",
    dataset: {},
    hasAttribute: () => false,
  };
  const event = {
    target: { closest: (selector) => selector === "a[href]" ? anchor : null },
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() { this.defaultPrevented = true; },
  };

  guard.markDirty();
  documentObject.dispatch("click", event);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(destinations, [anchor.href]);
  binding.dispose();
  assert.equal(windowObject.listeners.get("beforeunload").size, 0);
  assert.equal(documentObject.listeners.get("click").size, 0);
});
