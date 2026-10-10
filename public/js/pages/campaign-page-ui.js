import { db } from '../core/firebase.js';
import { doc, getDoc } from '/vendor/firebase/firebase-firestore.js';
import { onAuth, getClaims, signOutNow, initAuthRedirectHandling } from '../core/auth-ui.js';
import { ensureAppTopNav } from '../core/app-nav.js?v=mobile-menu1';
import { createNavigationGuard, installNavigationGuard } from '../core/navigation-guard.js';

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** Shared campaign-page action, authentication and pending-write lifecycle. */
export function createCampaignPage() {
  const status = document.getElementById('campaignStatus');
  const error = document.getElementById('campaignError');
  let busy = false;
  let pendingAction = null;
  const navigation = createNavigationGuard({
    getState: () => ({ saving: !!pendingAction }),
    flush: async () => { await pendingAction; return true; },
    navigate: href => location.assign(href),
  });
  installNavigationGuard({ guard: navigation });
  function showError(cause) {
    console.error(cause);
    error.textContent = cause?.code === 'permission-denied'
      ? 'This campaign or invitation is unavailable. Ask the creator for a current code.'
      : cause?.message || 'Could not complete the campaign request. Please try again.';
    error.hidden = false;
  }
  async function act(control, action) {
    if (busy) return;
    busy = true; control.disabled = true; error.hidden = true;
    status.textContent = 'Saving…';
    let destination;
    try {
      pendingAction = Promise.resolve().then(action);
      const result = await pendingAction;
      status.textContent = typeof result === 'string' ? result : result?.message || 'Saved.';
      destination = result?.navigateTo;
    } catch (cause) { status.textContent = ''; showError(cause); }
    finally {
      pendingAction = null; busy = false; control.disabled = false;
      if (control.isConnected) control.focus({ preventScroll: true });
    }
    // Complete the pending-write lifecycle before invoking beforeunload guards.
    if (destination) location.assign(destination);
  }
  function button(label, action, secondary = true) {
    const node = element('button', label, `btn${secondary ? ' secondary' : ''}`);
    node.type = 'button'; node.addEventListener('click', () => act(node, action));
    return node;
  }
  async function start(onReady, onReset = () => {}) {
    await initAuthRedirectHandling();
    onAuth(async user => {
      onReset();
      if (!user) {
        // Keep invitation secrets in the fragment throughout sign-in.
        location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search)}${location.hash}`);
        return;
      }
      try {
        const claims = await getClaims(user);
        const nav = ensureAppTopNav({ active: 'campaigns', isGM: claims.gm,
          onSignOut: async () => { if (await navigation.flush()) await signOutNow(); } });
        nav.signOut.style.display = '';
        const profile = await getDoc(doc(db, 'users', user.uid));
        await onReady(user, profile.data()?.displayName || user.displayName || '', claims);
      } catch (cause) { showError(cause); }
    });
  }
  return { status, showError, act, button, start };
}
