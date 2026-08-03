export function createDialogLifecycle({
  onOpen = null,
  onClose = null,
} = {}) {
  const open = typeof onOpen === "function" ? onOpen : null;
  const close = typeof onClose === "function" ? onClose : null;
  let activeRequest = null;

  function settle(result, { reason = "" } = {}) {
    if (!activeRequest) return false;
    const request = activeRequest;
    activeRequest = null;

    try {
      close?.(request.context, {
        result: !!result,
        reason: String(reason || ""),
      });
    } finally {
      request.resolve(!!result);
    }
    return true;
  }

  function request(context = {}) {
    if (activeRequest) settle(false, { reason: "superseded" });

    return new Promise((resolve) => {
      activeRequest = { context, resolve };
      try {
        open?.(context);
      } catch (error) {
        settle(false, { reason: "open-error" });
      }
    });
  }

  function getActiveContext() {
    return activeRequest?.context || null;
  }

  return Object.freeze({
    request,
    settle,
    getActiveContext,
  });
}

export function restoreDialogFocus(opener, { reason = "" } = {}) {
  if (
    reason === "superseded"
    || !opener?.isConnected
    || typeof opener.focus !== "function"
  ) {
    return false;
  }

  queueMicrotask(() => {
    if (opener.isConnected) opener.focus({ preventScroll: true });
  });
  return true;
}
