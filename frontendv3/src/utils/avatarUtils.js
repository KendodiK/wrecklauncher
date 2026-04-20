export function getBestAvatarUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  const host = parsed.hostname.toLowerCase();
  let pathname = parsed.pathname;

  // Steam profile avatars often expose multiple sizes; prefer full resolution.
  pathname = pathname
    .replace(/_medium\.(jpg|jpeg|png|webp)$/i, '_full.$1')
    .replace(/_normal\.(jpg|jpeg|png|webp)$/i, '_full.$1');

  // pravatar supports size via the first path segment, e.g. /160 -> /512
  if (host.includes('pravatar.cc')) {
    pathname = pathname.replace(/^\/\d+(?=\/|$)/, '/512');
  }

  parsed.pathname = pathname;

  // Common avatar providers accept query-based sizing.
  const sizeKeys = ['s', 'size', 'w', 'width', 'h', 'height'];
  for (const key of sizeKeys) {
    const current = Number(parsed.searchParams.get(key));
    if (Number.isFinite(current)) {
      parsed.searchParams.set(key, String(Math.max(current, 512)));
    }
  }

  if (host.includes('gravatar.com') && !parsed.searchParams.get('s')) {
    parsed.searchParams.set('s', '512');
  }

  return parsed.toString();
}
