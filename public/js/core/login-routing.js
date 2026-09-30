export function safeLoginNextHref({ next, origin, hash = '' }) {
  if (!next) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;
    if (url.pathname === '/campaigns.html' && hash.startsWith('#join=')) url.hash = hash;
    return url.href;
  } catch { return null; }
}
