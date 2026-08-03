function normalizeError(value) {
  if (value instanceof Error) return value;
  return new Error(String(value || "Save failed."));
}

export function createSaveCoordinator({
  save,
  debounceMs = 0,
  onStateChange = null,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timerId) => clearTimeout(timerId),
} = {}) {
  if (typeof save !== "function") {
    throw new TypeError("createSaveCoordinator requires a save function.");
  }

  const notify = typeof onStateChange === "function" ? onStateChange : null;
  const delay = Math.max(0, Number(debounceMs) || 0);
  let status = "idle";
  let revision = 0;
  let savedRevision = 0;
  let scheduledTimer = null;
  let inFlight = null;
  let lastError = null;
  let disposed = false;

  function getState() {
    return Object.freeze({
      status,
      dirty: revision > savedRevision,
      saving: status === "saving",
      scheduled: scheduledTimer !== null,
      revision,
      savedRevision,
      error: lastError,
    });
  }

  function emit(nextStatus = status) {
    status = nextStatus;
    const state = getState();
    notify?.(state);
    return state;
  }

  function clearScheduledSave() {
    if (scheduledTimer === null) return;
    clearTimer(scheduledTimer);
    scheduledTimer = null;
  }

  function scheduleFlush() {
    clearScheduledSave();
    if (disposed || inFlight || revision <= savedRevision) return;
    scheduledTimer = setTimer(() => {
      scheduledTimer = null;
      void flush();
    }, delay);
  }

  function markDirty() {
    if (disposed) return getState();
    revision += 1;
    lastError = null;
    emit(inFlight ? "saving" : "dirty");
    scheduleFlush();
    return getState();
  }

  function markClean() {
    if (disposed) return getState();
    clearScheduledSave();
    savedRevision = revision;
    lastError = null;
    return emit("saved");
  }

  function flush() {
    if (disposed) return Promise.resolve(false);
    clearScheduledSave();
    if (inFlight) return inFlight;
    if (revision <= savedRevision) {
      if (status !== "saved") emit("saved");
      return Promise.resolve(true);
    }

    const run = async () => {
      while (!disposed && savedRevision < revision) {
        const targetRevision = revision;
        emit("saving");
        try {
          await save({ revision: targetRevision, state: getState() });
          savedRevision = targetRevision;
          lastError = null;
        } catch (error) {
          lastError = normalizeError(error);
          emit("error");
          return false;
        }
      }

      if (disposed) return false;
      emit("saved");
      return true;
    };

    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function retry() {
    if (disposed) return Promise.resolve(false);
    lastError = null;
    if (revision > savedRevision) emit("dirty");
    return flush();
  }

  function dispose() {
    disposed = true;
    clearScheduledSave();
  }

  emit("idle");

  return Object.freeze({
    getState,
    markDirty,
    markClean,
    flush,
    retry,
    dispose,
  });
}
