// @ts-check

const fs = require('fs');
const path = require('path');

/** @type {any|null|undefined} */
let cachedDispatcher;

/**
 * Creates (and caches) an undici dispatcher for localhost HTTPS.
 *
 * Priority:
 * 1) Trust mkcert root CA if available (recommended)
 * 2) Dev fallback: optionally allow self-signed certs for localhost only
 *
 * @returns {any|null}
 */
function getLocalhostDispatcher() {
  if (cachedDispatcher !== undefined) return cachedDispatcher;
  cachedDispatcher = null;

  let Agent;
  try {
    ({ Agent } = require('undici'));
  } catch {
    return cachedDispatcher;
  }

  const candidates = [
    process.env.MKCERT_ROOT_CA,
    process.env.NODE_EXTRA_CA_CERTS,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'mkcert', 'rootCA.pem') : null,
  ].filter(Boolean);

  const rootCaPath = candidates.find((p) => {
    try {
      return typeof p === 'string' && fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!rootCaPath) return cachedDispatcher;

  let ca;
  try {
    ca = fs.readFileSync(rootCaPath);
  } catch {
    return cachedDispatcher;
  }

  cachedDispatcher = new Agent({ connect: { ca } });
  return cachedDispatcher;
}

/**
 * Creates an undici dispatcher that disables TLS verification.
 * This is only intended for https://localhost in development.
 *
 * @returns {any|null}
 */
function getInsecureLocalhostDispatcher() {
  let Agent;
  try {
    ({ Agent } = require('undici'));
  } catch {
    return null;
  }

  return new Agent({ connect: { rejectUnauthorized: false } });
}

// Wrap the exported function so callers get mkcert when possible,
// otherwise (in dev) can opt into trusting the backend's self-signed cert.
const _getLocalhostDispatcher = getLocalhostDispatcher;
function getLocalhostDispatcherWrapped() {
  const mkcert = _getLocalhostDispatcher();
  if (mkcert) return mkcert;

  // Explicit opt-in only. This keeps HTTPS strict by default.
  const allowInsecure = process.env.WRECK_INSECURE_LOCALHOST_TLS === '1';

  if (!allowInsecure) return null;
  return getInsecureLocalhostDispatcher();
}

module.exports = {
  getLocalhostDispatcher: getLocalhostDispatcherWrapped,
};
