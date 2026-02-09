// @ts-check

const fs = require('fs');
const path = require('path');

/** @type {any|null|undefined} */
let cachedDispatcher;

/**
 * Creates (and caches) an undici dispatcher that trusts mkcert's local CA.
 * Only applies to https://localhost.
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

module.exports = {
  getLocalhostDispatcher,
};
