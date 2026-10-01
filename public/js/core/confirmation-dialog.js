import { createDialogLifecycle, restoreDialogFocus } from './dialog-lifecycle.js';

let lifecycle;

/** Shared, keyboard-accessible confirmation. Closing or superseding always cancels. */
export function confirmCampaignChange(message, { title: titleText = 'Confirm campaign change', confirmText = 'Confirm change' } = {}) {
  if (!lifecycle) {
    const dialog = document.createElement('dialog');
    dialog.className = 'campaign-confirm';
    dialog.setAttribute('aria-labelledby', 'campaign-confirm-title');
    dialog.setAttribute('aria-describedby', 'campaign-confirm-message');
    const title = document.createElement('h2');
    title.id = 'campaign-confirm-title'; title.textContent = 'Confirm campaign change';
    const description = document.createElement('p'); description.id = 'campaign-confirm-message';
    const controls = document.createElement('div'); controls.className = 'campaign-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn secondary'; cancel.textContent = 'Cancel';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn'; confirm.textContent = 'Confirm change';
    controls.append(cancel, confirm); dialog.append(title, description, controls); document.body.append(dialog);
    lifecycle = createDialogLifecycle({
      onOpen(context) {
        title.textContent = context.titleText;
        confirm.textContent = context.confirmText;
        description.textContent = context.message;
        dialog.showModal(); cancel.focus();
      },
      onClose(context, detail) { dialog.close(); restoreDialogFocus(context.opener, detail); },
    });
    cancel.addEventListener('click', () => lifecycle.settle(false, { reason: 'cancel' }));
    confirm.addEventListener('click', () => lifecycle.settle(true, { reason: 'confirm' }));
    dialog.addEventListener('cancel', event => { event.preventDefault(); lifecycle.settle(false, { reason: 'escape' }); });
    dialog.addEventListener('close', () => lifecycle.settle(false, { reason: 'closed' }));
    window.addEventListener('pagehide', () => lifecycle.settle(false, { reason: 'navigation' }));
  }
  return lifecycle.request({ message, titleText, confirmText, opener: document.activeElement });
}
