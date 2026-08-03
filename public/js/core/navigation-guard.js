function normalizeGuardState(state = {}) {
  return Object.freeze({
    dirty: !!state?.dirty,
    saving: !!state?.saving,
    error: state?.error || null,
  });
}

export function createNavigationGuard({
  flush,
  getState = null,
  navigate = null,
} = {}) {
  if (typeof flush !== "function") {
    throw new TypeError("createNavigationGuard requires a flush function.");
  }

  const readExternalState = typeof getState === "function" ? getState : null;
  const performNavigation = typeof navigate === "function" ? navigate : () => {};
  let localDirty = false;
  let localSaving = false;
  let lastError = null;
  let inFlightFlush = null;
  let inFlightNavigation = null;

  function getGuardState() {
    if (readExternalState) {
      const externalState = readExternalState() || {};
      return normalizeGuardState({
        ...externalState,
        saving: !!externalState.saving || localSaving,
        error: externalState.error || lastError,
      });
    }
    return normalizeGuardState({
      dirty: localDirty,
      saving: localSaving,
      error: lastError,
    });
  }

  function shouldBlockUnload() {
    const state = getGuardState();
    return state.dirty || state.saving;
  }

  function markDirty() {
    if (!readExternalState) {
      localDirty = true;
      lastError = null;
    }
    return getGuardState();
  }

  function markClean() {
    if (!readExternalState) {
      localDirty = false;
      lastError = null;
    }
    return getGuardState();
  }

  function flushPending() {
    if (!shouldBlockUnload()) return Promise.resolve(true);
    if (inFlightFlush) return inFlightFlush;

    localSaving = true;
    inFlightFlush = (async () => {
      try {
        const result = await flush();
        if (result === false) return false;
        if (!readExternalState) localDirty = false;
        lastError = null;
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error || "Save failed."));
        return false;
      } finally {
        localSaving = false;
        inFlightFlush = null;
      }
    })();
    return inFlightFlush;
  }

  function navigateAfterFlush(href) {
    if (inFlightNavigation) return inFlightNavigation;
    inFlightNavigation = (async () => {
      const ok = await flushPending();
      if (!ok) return false;
      performNavigation(href);
      return true;
    })().finally(() => {
      inFlightNavigation = null;
    });
    return inFlightNavigation;
  }

  function handleBeforeUnload(event) {
    if (!shouldBlockUnload()) return false;
    event?.preventDefault?.();
    if (event) event.returnValue = true;
    return true;
  }

  return Object.freeze({
    getState: getGuardState,
    shouldBlockUnload,
    markDirty,
    markClean,
    flush: flushPending,
    navigate: navigateAfterFlush,
    handleBeforeUnload,
  });
}

function isGuardedLinkClick(event, anchor, windowObject) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target.toLowerCase() !== "_self") return false;
  if (anchor.dataset.navigationManaged === "true") return false;

  let url;
  try {
    url = new URL(anchor.href, windowObject.location.href);
  } catch (_error) {
    return false;
  }
  if (url.origin !== windowObject.location.origin) return false;
  if (!/^https?:$/.test(url.protocol)) return false;

  const current = new URL(windowObject.location.href);
  const onlyHashChanged = url.pathname === current.pathname
    && url.search === current.search
    && url.hash !== current.hash;
  return !onlyHashChanged;
}

export function installNavigationGuard({
  guard,
  windowObject = window,
  documentObject = document,
  dirtyRoot = null,
  trackDirty = false,
} = {}) {
  if (!guard || typeof guard.navigate !== "function") {
    throw new TypeError("installNavigationGuard requires a navigation guard.");
  }

  const onBeforeUnload = (event) => guard.handleBeforeUnload(event);
  const onDocumentClick = (event) => {
    const target = event.target;
    const anchor = target?.closest?.("a[href]");
    if (anchor && isGuardedLinkClick(event, anchor, windowObject)) {
      if (!guard.shouldBlockUnload()) return;
      event.preventDefault();
      void guard.navigate(anchor.href);
      return;
    }

    if (!trackDirty || !dirtyRoot?.contains?.(target)) return;
    const button = target?.closest?.("button");
    if (!button || button.disabled) return;
    if (button.matches(
      "#saveBtn, #saveAndOpenBtn, .tipBtn, [data-dirty-ignore], [data-dialog-accept], [data-dialog-cancel]",
    )) return;
    guard.markDirty();
  };
  const onFieldEdit = (event) => {
    if (!trackDirty || !dirtyRoot?.contains?.(event.target)) return;
    if (event.target?.closest?.("[data-dirty-ignore]")) return;
    guard.markDirty();
  };

  windowObject.addEventListener("beforeunload", onBeforeUnload);
  documentObject.addEventListener("click", onDocumentClick);
  dirtyRoot?.addEventListener?.("input", onFieldEdit);
  dirtyRoot?.addEventListener?.("change", onFieldEdit);

  return Object.freeze({
    dispose() {
      windowObject.removeEventListener("beforeunload", onBeforeUnload);
      documentObject.removeEventListener("click", onDocumentClick);
      dirtyRoot?.removeEventListener?.("input", onFieldEdit);
      dirtyRoot?.removeEventListener?.("change", onFieldEdit);
    },
  });
}
