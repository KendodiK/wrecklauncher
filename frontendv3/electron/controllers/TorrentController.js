// @ts-check
'use strict';

/**
 * @typedef {import('../models').TorrentProgress} TorrentProgress
 */

/**
 * TorrentController
 *
 * Manages torrent downloads via WebTorrent inside the Electron main process.
 * WebTorrent v2+ is ESM-only, so it is loaded with a dynamic `import()` which
 * works fine from a CommonJS module in Node ≥ 14.
 *
 * Usage pattern in main.js:
 *   const ctrl = getTorrentCtrl();
 *   const { infoHash } = await ctrl.start(magnetUri, savePath, (p) => {
 *     mainWindow.webContents.send('torrent:progress', p);
 *   });
 */
class TorrentController {
  /** @type {import('webtorrent').default | null} */
  #client = null;

  /** @type {Promise<import('webtorrent').default> | null} */
  #clientPromise = null;

  /** @type {Map<string, Promise<any>> | null} */
  static #pending = null;

  /** @type {Set<string>} */
  #forcedPaused = new Set();

  /**
   * Lazily initialise the WebTorrent client (ESM dynamic import).
   * @returns {Promise<import('webtorrent').default>}
   */
  async #getClient() {
    if (this.#client) return this.#client;

    if (!this.#clientPromise) {
      this.#clientPromise = (async () => {
        console.log('[TorrentController] loading webtorrent via dynamic import…');
        const mod = await import('webtorrent');
        const WebTorrent = mod.default ?? mod;
        console.log('[TorrentController] webtorrent loaded, creating client…');
        const client = new WebTorrent({
          // Port 0 = OS picks a free port, avoids EACCES on the default 6881.
          torrentPort: 0,
          dhtPort:     0,
          // UTP is back on — it is faster than TCP for most peers.
          // The EACCES we saw earlier was non-fatal; we handle it below.
          utp: true,
          // Allow up to 200 simultaneous peer connections per client.
          maxConns: 200,
        });
        client.on('error', (err) => {
          const code = /** @type {any} */ (err)?.code;
          if (code === 'EACCES' || code === 'EADDRINUSE') {
            // UTP/TCP socket binding failed — non-fatal, other transport still works.
            console.warn('[TorrentController] socket bind warning (non-fatal):', err.message);
          } else {
            console.error('[TorrentController] WebTorrent client error:', err);
          }
        });
        console.log('[TorrentController] client ready');
        this.#client = client;
        return client;
      })().catch((err) => {
        console.error('[TorrentController] failed to load webtorrent:', err);
        this.#clientPromise = null;
        throw err;
      });
    }

    this.#client = await this.#clientPromise;
    return this.#client;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * @param {import('webtorrent').Torrent} t
   * @param {string} [fallbackPath]
   * @returns {TorrentProgress}
   */
  #snapshot(t, fallbackPath = '') {
    const tr = t.timeRemaining;
    const hash = String(t.infoHash ?? '').trim().toLowerCase();
    const forcedPaused = !!hash && this.#forcedPaused.has(hash);
    return {
      infoHash:      t.infoHash      ?? '',
      name:          t.name          ?? t.infoHash ?? 'Pending…',
      progress:      t.progress      ?? 0,
      downloadSpeed: t.downloadSpeed ?? 0,
      uploadSpeed:   t.uploadSpeed   ?? 0,
      downloaded:    t.downloaded    ?? 0,
      uploaded:      t.uploaded      ?? 0,
      length:        t.length        ?? 0,
      numPeers:      t.numPeers      ?? 0,
      // Infinity is valid for structured-clone (IPC) but becomes null in JSON.stringify.
      // Encode it as -1 so the renderer can display '∞' without special-casing.
      timeRemaining: (tr == null || !Number.isFinite(tr)) ? -1 : tr,
      paused:        forcedPaused || (t.paused ?? false),
      done:          t.done          ?? false,
      magnetURI:     (typeof t.magnetURI === 'string' ? t.magnetURI : ''),
      savePath:      t.path          || fallbackPath,
      path:          t.path          || fallbackPath,
    };
  }

  /**
   * Resolve a real torrent object by infoHash from the active client.
   * In some WebTorrent flows `client.get(infoHash)` may return a lightweight stub,
   * so we prefer scanning `client.torrents` first.
   *
   * @param {string} infoHash
   * @returns {import('webtorrent').Torrent | null}
   */
  #findTorrentByInfoHash(infoHash) {
    const client = this.#client;
    if (!client) return null;
    const target = String(infoHash || '').trim().toLowerCase();
    if (!target) return null;

    const fromList = Array.isArray(client.torrents)
      ? client.torrents.find((/** @type {any} */ torrent) => {
          const hash = String(torrent?.infoHash || '').trim().toLowerCase();
          return hash === target;
        })
      : null;

    if (fromList) return fromList;

    const fromGet = client.get(String(infoHash));
    if (!fromGet) return null;
    return /** @type {import('webtorrent').Torrent} */ (fromGet);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start (or reuse) a torrent download from a magnet URI or .torrent file path/Buffer.
   *
   * Progress updates are delivered by calling `onProgress` approximately once per second
   * while the torrent is active.  The caller is responsible for forwarding these to
   * the renderer (e.g. via `mainWindow.webContents.send('torrent:progress', p)`).
   *
   * @param {string} magnetOrUri     Magnet URI (`magnet:?xt=…`) or HTTPS URL to a .torrent file.
   * @param {string} savePath        Absolute directory path where files will be saved.
   * @param {(progress: TorrentProgress) => void} onProgress  Called every ~1 s with the current state.
   * @returns {Promise<TorrentProgress>}  Initial snapshot (metadata may not yet be resolved).
   */
  async start(magnetOrUri, savePath, onProgress) {
    if (!magnetOrUri || !String(magnetOrUri).trim()) throw new Error('magnetOrUri is required');
    if (!savePath   || !String(savePath  ).trim()) throw new Error('savePath is required');

    const client = await this.#getClient();

    // Guard against concurrent calls with the same magnet URI while add() is in flight.
    if (!TorrentController.#pending) TorrentController.#pending = new Map();
    const pending = TorrentController.#pending;
    if (pending.has(magnetOrUri)) {
      console.log('[TorrentController] concurrent add in progress, waiting…');
      const torrent = await pending.get(magnetOrUri);
      return this.#snapshot(torrent, savePath);
    }

    // Do NOT use client.get() — in webtorrent v2 it returns a broken stub object
    // for magnet URIs even on a fresh client.  client.add() handles deduplication
    // internally: if the infoHash was already added it returns the existing torrent.
    const addResultPromise = (async () => {
      const raw = client.add(magnetOrUri, { path: savePath });
      console.log('[TorrentController] client.add() raw type:', typeof raw, ' isPromise:', raw instanceof Promise);
      const torrent = (raw instanceof Promise) ? await raw : raw;
      console.log('[TorrentController] torrent ready — infoHash:', torrent.infoHash, ' name:', torrent.name, ' path:', torrent.path);
      return torrent;
    })();

    pending.set(magnetOrUri, addResultPromise.finally(() => {
      pending.delete(magnetOrUri);
    }));

    let torrent;
    try {
      torrent = await addResultPromise;
    } catch (err) {
      console.error('[TorrentController] client.add() threw:', err);
      throw err;
    }

    /** @type {ReturnType<typeof setInterval> | null} */
    let ticker = null;

    const startTicker = () => {
      if (ticker) return;
      ticker = setInterval(() => {
        if (!torrent.destroyed) {
          onProgress(this.#snapshot(torrent, savePath));
        } else {
          clearInterval(/** @type {any} */ (ticker));
          ticker = null;
        }
      }, 1_000);
    };

    // Start pushing progress right away so the renderer sees peer / speed
    // updates as soon as DHT/tracker lookups begin.
    startTicker();

    torrent.on('done', () => {
      clearInterval(/** @type {any} */ (ticker));
      ticker = null;
      onProgress({ ...this.#snapshot(torrent, savePath), done: true });
    });

    torrent.on('error', (/** @type {any} */ err) => {
      clearInterval(/** @type {any} */ (ticker));
      ticker = null;
      const errObj = err instanceof Error ? err : new Error(String(err));
      onProgress({ ...this.#snapshot(torrent, savePath), name: `Error: ${errObj.message}`, done: true });
    });

    // Return the synchronous snapshot — already has real infoHash / name / path.
    return this.#snapshot(torrent, savePath);
  }

  /**
   * Pause an active torrent.
   * @param {string} infoHash
   */
  pause(infoHash) {
    if (!this.#client) throw new Error('No active WebTorrent client');
    const t = this.#findTorrentByInfoHash(infoHash);
    if (!t) throw new Error(`Torrent not found: ${infoHash}`);
    const hash = String(t.infoHash || infoHash || '').trim().toLowerCase();
    if (typeof t.pause === 'function') {
      t.pause();
    }
    const torrentAny = /** @type {any} */ (t);
    if (Array.isArray(torrentAny.wires)) {
      for (const wire of torrentAny.wires) {
        try {
          wire?.destroy?.();
        } catch {
          // ignore
        }
      }
    }
    if (hash) this.#forcedPaused.add(hash);
    return this.#snapshot(t);
  }

  /**
   * Resume a paused torrent.
   * @param {string} infoHash
   */
  resume(infoHash) {
    if (!this.#client) throw new Error('No active WebTorrent client');
    const t = this.#findTorrentByInfoHash(infoHash);
    if (!t) throw new Error(`Torrent not found: ${infoHash}`);
    const hash = String(t.infoHash || infoHash || '').trim().toLowerCase();
    if (hash) this.#forcedPaused.delete(hash);
    if (typeof t.resume === 'function') {
      t.resume();
    }
    const torrentAny = /** @type {any} */ (t);
    if (typeof torrentAny._drain === 'function') {
      try {
        torrentAny._drain();
      } catch {
        // ignore
      }
    }
    if (torrentAny.discovery?.tracker && typeof torrentAny.discovery.tracker.start === 'function') {
      try {
        torrentAny.discovery.tracker.start();
      } catch {
        // ignore
      }
    }
    return this.#snapshot(t);
  }

  /**
   * Remove a torrent from the client.
   * @param {string} infoHash
   * @param {boolean} [destroyStore]  If true, delete downloaded files from disk as well.
   * @returns {Promise<void>}
   */
  remove(infoHash, destroyStore = false) {
    if (!this.#client) return Promise.resolve();
    const t = this.#findTorrentByInfoHash(infoHash);
    const hash = String(t?.infoHash || infoHash || '').trim().toLowerCase();
    if (hash) this.#forcedPaused.delete(hash);
    if (!t) return Promise.resolve();
    const client = this.#client;
    const torrentId = String(t.infoHash || infoHash || '').trim();
    if (client && typeof client.remove === 'function') {
      return new Promise((resolve, reject) => {
        //@ts-ignore
        client.remove(torrentId, { destroyStore: Boolean(destroyStore) }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    return new Promise((resolve, reject) => {
      t.destroy({ destroyStore: Boolean(destroyStore) }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Return a snapshot of every currently tracked torrent.
   * @returns {TorrentProgress[]}
   */
  getStatus() {
    if (!this.#client) return [];
    return this.#client.torrents.map((/** @type {any} */ t) => this.#snapshot(t));
  }

  /**
   * Gracefully destroy the WebTorrent client (called on app quit).
   * @returns {Promise<void>}
   */
  destroy() {
    const client = this.#client;
    this.#client = null;
    this.#clientPromise = null;
    if (!client) return Promise.resolve();
    return new Promise((resolve) => client.destroy(resolve));
  }
}

module.exports = TorrentController;
