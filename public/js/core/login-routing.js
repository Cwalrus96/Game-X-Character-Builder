export function safeLoginNextHref({ next, origin, hash = '' }) {
  if (!next) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;
    if (['/campaigns.html', '/campaign-join.html'].includes(url.pathname) && hash.startsWith('#join=')) url.hash = hash;
    return url.href;
  } catch { return null; }
}
