// @ts-check

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasScheme(value) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/**
 * Normalizes a backend base URL.
 * - Adds a default scheme if missing
 * - Trims trailing slashes
 *
 * Note: This helper does NOT auto-upgrade http -> https.
 * If you want HTTPS, pass an https:// URL explicitly.
 *
 * @param {string} serverUrl
 * @param {{ defaultProtocol?: 'http:'|'https:' }} [opts]
 * @returns {string}
 */
function normalizeBaseUrl(serverUrl, opts) {
  const defaultProtocol = opts?.defaultProtocol ?? 'http:';
  const trimmed = String(serverUrl || '').trim();
  if (!trimmed) return 'http://127.0.0.1:3001';

  const withScheme = hasScheme(trimmed) ? trimmed : `${defaultProtocol}//${trimmed}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return trimmed.replace(/\/+$/, '');
  }

  return url.toString().replace(/\/+$/, '');
}

/**
 * @param {string} segment
 * @returns {string}
 */
function enc(segment) {
  return encodeURIComponent(String(segment ?? ''));
}

/**
 * @param {string} baseUrl
 * @param {...string} parts
 * @returns {string}
 */
function joinUrl(baseUrl, ...parts) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const tail = parts
    .filter((p) => p !== undefined && p !== null)
    .map((p) => String(p))
    .map((p) => p.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean)
    .join('/');
  return tail ? `${base}/${tail}` : base;
}

module.exports = {
  normalizeBaseUrl,
  enc,
  joinUrl,
};
