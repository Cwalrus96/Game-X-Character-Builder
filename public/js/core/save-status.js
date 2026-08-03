export function getSaveStatusPresentation(state = {}) {
  const status = String(state?.status || "idle");
  const dirty = !!state?.dirty;
  const saving = !!state?.saving;
  const errorMessage = state?.error?.message ? String(state.error.message) : "";

  let message = "Loading character...";
  if (status === "dirty") message = "Unsaved changes";
  if (status === "saving") message = "Saving...";
  if (status === "saved") message = "Saved";
  if (status === "error") {
    message = dirty
      ? "Save failed. Changes are still unsaved."
      : "Could not load character.";
  }

  return Object.freeze({
    status,
    message,
    busy: saving,
    title: errorMessage,
    retryVisible: status === "error" && dirty,
    retryDisabled: saving,
  });
}
