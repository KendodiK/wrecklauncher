// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

  /** @type {any | null} */
  #windowsNonLockingStoreClass = null;

  /** @type {Promise<any> | null} */
  #windowsNonLockingStoreClassPromise = null;

  /** @type {Map<string, Promise<any>> | null} */
  static #pending = null;

  /** @type {Set<string>} */
  #forcedPaused = new Set();

  /** @type {Map<string, string>} */
  #preferredDisplayNames = new Map();

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
            const message = String((/** @type {any} */ (err))?.message || err || 'Unknown error');
            console.warn('[TorrentController] socket bind warning (non-fatal):', message);
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

  /**
   * Windows-only chunk store wrapper that closes file handles after each read/write.
   * This reduces long-lived locks on in-progress download files.
   *
   * @returns {Promise<any|null>}
   */
  async #getWindowsNonLockingStoreClass() {
    if (process.platform !== 'win32') return null;
    if (this.#windowsNonLockingStoreClass) return this.#windowsNonLockingStoreClass;

    if (!this.#windowsNonLockingStoreClassPromise) {
      this.#windowsNonLockingStoreClassPromise = (async () => {
        try {
          const fsChunkStoreMod = await import('fs-chunk-store');
          const rafMod = await import('random-access-file');
          const FSChunkStore = fsChunkStoreMod.default ?? fsChunkStoreMod;
          const RandomAccessFile = rafMod.default ?? rafMod;

          if (typeof FSChunkStore !== 'function' || typeof RandomAccessFile !== 'function') {
            return null;
          }

          class NonLockingFsChunkStore extends FSChunkStore {
            constructor(/** @type {number} */ chunkLength, /** @type {any} */ opts = {}) {
              super(chunkLength, opts);

              for (const file of this.files || []) {
                const targetPath = String(file?.path || '').trim();
                if (!targetPath) continue;

                file.open = (/** @type {any} */ cb) => {
                  if (this.closed) return cb(new Error('Storage is closed'));

                  fs.mkdir(path.dirname(targetPath), { recursive: true }, (mkdirErr) => {
                    if (mkdirErr) return cb(mkdirErr);
                    if (this.closed) return cb(new Error('Storage is closed'));

                    const raf = new RandomAccessFile(targetPath);

                    /** @param {(err: Error|null) => void} done */
                    const closeQuietly = (done) => {
                      raf.close((closeErr) => {
                        const msg = String((/** @type {any} */ (closeErr))?.message || closeErr || '').toLowerCase();
                        if (closeErr && msg && !msg.includes('closed')) {
                          return done(/** @type {Error} */ (closeErr));
                        }
                        return done(null);
                      });
                    };

                    cb(null, {
                      write: (
                        /** @type {number} */ offset,
                        /** @type {Buffer} */ buffer,
                        /** @type {(err: Error|null) => void} */ done
                      ) => {
                        raf.write(offset, buffer, (writeErr) => {
                          closeQuietly((closeErr) => done(writeErr || closeErr || null));
                        });
                      },
                      read: (
                        /** @type {number} */ offset,
                        /** @type {number} */ length,
                        /** @type {(err: Error|null, data?: Uint8Array|Buffer) => void} */ done
                      ) => {
                        raf.read(offset, length, (readErr, data) => {
                          closeQuietly((closeErr) => done(readErr || closeErr || null, data));
                        });
                      },
                      close: (/** @type {(err: Error|null) => void} */ done) => {
                        closeQuietly((closeErr) => done(closeErr || null));
                      },
                    });
                  });
                };
              }
            }
          }

          this.#windowsNonLockingStoreClass = NonLockingFsChunkStore;
          return NonLockingFsChunkStore;
        } catch (err) {
          console.warn('[TorrentController] Failed to enable non-locking chunk store; using default fs store:', err);
          return null;
        }
      })();
    }

    const resolved = await this.#windowsNonLockingStoreClassPromise;
    if (resolved) {
      this.#windowsNonLockingStoreClass = resolved;
    }
    return resolved;
  }

  /**
   * Wait briefly for a newly added torrent to expose its infoHash.
   * URL-based torrent sources may resolve metadata asynchronously.
   *
   * @param {import('webtorrent').Torrent} torrent
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  async #waitForTorrentIdentity(torrent, timeoutMs = 12_000) {
    const startedAt = Date.now();
    while (true) {
      const torrentAny = /** @type {any} */ (torrent);
      if (!torrentAny || torrentAny.destroyed) return;
      const hash = String(torrentAny.infoHash || '').trim();
      if (hash) return;
      if ((Date.now() - startedAt) >= timeoutMs) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
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
    const preferredName = hash ? String(this.#preferredDisplayNames.get(hash) || '').trim() : '';
    const metadataName = String(t.name || '').trim();
    const infoHashText = String(t.infoHash || '').trim();
    const hasReliableMetadataName = !!metadataName
      && (!infoHashText || metadataName.toLowerCase() !== infoHashText.toLowerCase());
    const rawDownloaded = Number(t.downloaded);
    const rawLength = Number(t.length);
    const rawProgress = Number(t.progress);
    const downloadedFromProgress = (
      Number.isFinite(rawLength)
      && rawLength > 0
      && Number.isFinite(rawProgress)
      && rawProgress >= 0
    )
      ? Math.round(Math.min(1, rawProgress) * rawLength)
      : 0;
    const normalizedDownloaded = Number.isFinite(rawDownloaded)
      ? Math.max(0, Math.trunc(rawDownloaded))
      : 0;
    const effectiveDownloaded = Math.max(normalizedDownloaded, downloadedFromProgress);
    const rawMagnetURI = (typeof t.magnetURI === 'string' ? t.magnetURI.trim() : '');
    const derivedMagnetURI = hash ? `magnet:?xt=urn:btih:${hash}` : '';
    return {
      infoHash:      t.infoHash      ?? '',
      // Prefer the real torrent metadata name once available.
      // Fallback to renderer-provided display name while metadata is pending.
      name:          hasReliableMetadataName ? metadataName : (preferredName || metadataName || t.infoHash || 'Pending…'),
      progress:      t.progress      ?? 0,
      downloadSpeed: t.downloadSpeed ?? 0,
      uploadSpeed:   t.uploadSpeed   ?? 0,
      downloaded:    effectiveDownloaded,
      uploaded:      t.uploaded      ?? 0,
      length:        t.length        ?? 0,
      numPeers:      t.numPeers      ?? 0,
      // Infinity is valid for structured-clone (IPC) but becomes null in JSON.stringify.
      // Encode it as -1 so the renderer can display '∞' without special-casing.
      timeRemaining: (tr == null || !Number.isFinite(tr)) ? -1 : tr,
      paused:        forcedPaused || (t.paused ?? false),
      done:          t.done          ?? false,
      magnetURI:     rawMagnetURI || derivedMagnetURI,
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

  /**
   * @param {import('webtorrent').Torrent | null | undefined} torrent
   * @param {string} displayName
   */
  #applyPreferredDisplayName(torrent, displayName) {
    if (!torrent) return;
    const normalizedDisplayName = String(displayName || '').trim();
    if (!normalizedDisplayName) return;
    const hash = String(torrent.infoHash || '').trim().toLowerCase();
    if (!hash) return;
    this.#preferredDisplayNames.set(hash, normalizedDisplayName);
  }

  /**
   * @param {unknown} err
   * @returns {boolean}
   */
  #isNoTorrentError(err) {
    const message = String((/** @type {any} */ (err))?.message || err || '');
    return /No torrent with id/i.test(message);
  }

  /**
   * @param {unknown} err
   * @returns {boolean}
   */
  #isLockLikeFsError(err) {
    const code = String((/** @type {any} */ (err))?.code || '').toUpperCase();
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'ENOTEMPTY') {
      return true;
    }
    const message = String((/** @type {any} */ (err))?.message || err || '').toLowerCase();
    return (
      message.includes('operation not permitted')
      || message.includes('resource busy')
      || message.includes('in use')
      || message.includes('being used')
    );
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  #normalizePathToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /**
   * @param {string} target
   * @returns {void}
   */
  #tryMakeWritableRecursive(target) {
    const normalized = String(target || '').trim();
    if (!normalized) return;

    let stats;
    try {
      stats = fs.lstatSync(normalized);
    } catch {
      return;
    }

    if (stats.isDirectory()) {
      try {
        const entries = fs.readdirSync(normalized);
        for (const entry of entries) {
          this.#tryMakeWritableRecursive(path.join(normalized, entry));
        }
      } catch {
        // ignore traversal errors
      }
      try {
        fs.chmodSync(normalized, 0o777);
      } catch {
        // ignore chmod errors
      }
      return;
    }

    try {
      fs.chmodSync(normalized, 0o666);
    } catch {
      // ignore chmod errors
    }
  }

  /**
   * @param {import('webtorrent').Torrent} torrent
   * @param {string} preferredName
   * @returns {string[]}
   */
  #collectDownloadedTargets(torrent, preferredName = '') {
    /** @type {Set<string>} */
    const targets = new Set();

    const basePath = String(torrent?.path || '').trim();
    const torrentName = String(torrent?.name || '').trim();
    const normalizedBasePath = basePath ? path.normalize(basePath) : '';

    const torrentAny = /** @type {any} */ (torrent);
    const files = Array.isArray(torrentAny?.files) ? torrentAny.files : [];

    for (const file of files) {
      const rawCandidates = [
        String(file?.path || '').trim(),
        String(file?._path || '').trim(),
        String(file?.name || '').trim(),
      ];

      for (const raw of rawCandidates) {
        if (!raw) continue;
        const absolute = path.isAbsolute(raw)
          ? path.normalize(raw)
          : (normalizedBasePath ? path.normalize(path.join(normalizedBasePath, raw)) : '');
        if (!absolute) continue;
        targets.add(absolute);
        break;
      }
    }

    if (normalizedBasePath && torrentName) {
      targets.add(path.normalize(path.join(normalizedBasePath, torrentName)));
    }

    // If save path itself is a dedicated per-title folder, remove the folder as well.
    if (normalizedBasePath) {
      const baseNameToken = this.#normalizePathToken(path.basename(normalizedBasePath));
      const torrentNameToken = this.#normalizePathToken(torrentName);
      const preferredNameToken = this.#normalizePathToken(preferredName);
      const isDedicatedFolder =
        !!baseNameToken
        && (
          (!!preferredNameToken && baseNameToken === preferredNameToken)
          || (!!torrentNameToken && baseNameToken === torrentNameToken)
        );
      if (isDedicatedFolder) {
        targets.add(normalizedBasePath);
      }
    }

    return Array.from(targets);
  }

  /**
   * @param {string[]} targets
    * @returns {{ deletedTargets: string[], lockedTargets: string[], failedTargets: string[] }}
   */
  #removeDownloadedTargets(targets) {
    const normalizedTargets = Array.from(
      new Set(
        (Array.isArray(targets) ? targets : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .map((value) => path.normalize(value))
      )
    ).sort((a, b) => b.length - a.length);

    /** @type {string[]} */
    const deletedTargets = [];
    /** @type {string[]} */
    const lockedTargets = [];
    /** @type {string[]} */
    const failedTargets = [];

    for (const target of normalizedTargets) {
      if (!target) continue;

      let exists = false;
      try {
        exists = fs.existsSync(target);
      } catch (err) {
        if (this.#isLockLikeFsError(err)) {
          lockedTargets.push(target);
          continue;
        }
        const message = String((/** @type {any} */ (err))?.message || err || 'Unknown exists error');
        failedTargets.push(`${target}: ${message}`);
        continue;
      }
      if (!exists) continue;

      let removed = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          fs.rmSync(target, {
            recursive: true,
            force: true,
            maxRetries: 4,
            retryDelay: 120,
          });
          removed = true;
          break;
        } catch (err) {
          const code = String((/** @type {any} */ (err))?.code || '').toUpperCase();
          if (code === 'ENOENT') {
            removed = true;
            break;
          }

          // Windows lock/read-only fallbacks.
          if ((code === 'EPERM' || code === 'EACCES') && attempt === 0) {
            this.#tryMakeWritableRecursive(target);
            continue;
          }

          if (this.#isLockLikeFsError(err)) {
            continue;
          }

          const message = String((/** @type {any} */ (err))?.message || err || 'Unknown remove error');
          failedTargets.push(`${target}: ${message}`);
          break;
        }
      }

      if (removed) {
        deletedTargets.push(target);
        continue;
      }

      const alreadyFailed = failedTargets.some((entry) => entry.startsWith(`${target}:`));
      if (!alreadyFailed) {
        lockedTargets.push(target);
      }
    }

    return { deletedTargets, lockedTargets, failedTargets };
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
   * @param {string} [displayName] Optional renderer-provided name to show in the downloads list.
   * @returns {Promise<TorrentProgress>}  Initial snapshot (metadata may not yet be resolved).
   */
  async start(magnetOrUri, savePath, onProgress, displayName = '') {
    if (!magnetOrUri || !String(magnetOrUri).trim()) throw new Error('magnetOrUri is required');
    if (!savePath   || !String(savePath  ).trim()) throw new Error('savePath is required');

    const client = await this.#getClient();

    // Guard against concurrent calls with the same magnet URI while add() is in flight.
    if (!TorrentController.#pending) TorrentController.#pending = new Map();
    const pending = TorrentController.#pending;
    if (pending.has(magnetOrUri)) {
      console.log('[TorrentController] concurrent add in progress, waiting…');
      const torrent = await pending.get(magnetOrUri);
      this.#applyPreferredDisplayName(torrent, displayName);
      return this.#snapshot(torrent, savePath);
    }

    // Do NOT use client.get() — in webtorrent v2 it returns a broken stub object
    // for magnet URIs even on a fresh client.  client.add() handles deduplication
    // internally: if the infoHash was already added it returns the existing torrent.
    const addResultPromise = (async () => {
      /** @type {any} */
      const addOptions = { path: savePath };

      if (process.platform === 'win32') {
        const nonLockingStore = await this.#getWindowsNonLockingStoreClass();
        if (nonLockingStore) {
          addOptions.store = nonLockingStore;
          addOptions.storeCacheSlots = 0;
        }
      }

      const raw = client.add(magnetOrUri, addOptions);
      console.log('[TorrentController] client.add() raw type:', typeof raw, ' isPromise:', raw instanceof Promise);
      const torrent = (raw instanceof Promise) ? await raw : raw;
      await this.#waitForTorrentIdentity(torrent);
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

    this.#applyPreferredDisplayName(torrent, displayName);

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
   * @returns {Promise<{ removedFromClient: boolean, deleteRequested: boolean, deletedTargetCount: number, lockedTargets: string[], failedTargets: string[] }>}
   */
  remove(infoHash, destroyStore = true) {
    if (!this.#client) {
      return Promise.resolve({
        removedFromClient: true,
        deleteRequested: Boolean(destroyStore),
        deletedTargetCount: 0,
        lockedTargets: [],
        failedTargets: [],
      });
    }
    const t = this.#findTorrentByInfoHash(infoHash);
    const hash = String(t?.infoHash || infoHash || '').trim().toLowerCase();
    const preferredName = hash ? String(this.#preferredDisplayNames.get(hash) || '').trim() : '';
    const downloadedTargets = (destroyStore && t)
      ? this.#collectDownloadedTargets(t, preferredName)
      : [];
    if (hash) this.#forcedPaused.delete(hash);
    if (!t) {
      return Promise.resolve({
        removedFromClient: true,
        deleteRequested: Boolean(destroyStore),
        deletedTargetCount: 0,
        lockedTargets: [],
        failedTargets: [],
      });
    }
    const client = this.#client;
    const torrentId = String(t.infoHash || infoHash || '').trim();
    /** @type {Promise<void>} */
    let removePromise;
    if (client && typeof client.remove === 'function') {
      removePromise = new Promise((resolve, reject) => {
        let settled = false;
        /** @param {unknown} err */
        const finish = (err) => {
          if (settled) return;
          settled = true;
          if (!err || this.#isNoTorrentError(err) || this.#isLockLikeFsError(err)) {
            resolve();
            return;
          }
          reject(err);
        };

        try {
          //@ts-ignore
          // Detach first without store deletion; we do our own lock-tolerant cleanup below.
          const maybePromise = /** @type {any} */ (client.remove(torrentId, { destroyStore: false }, finish));
          if (maybePromise && typeof maybePromise.then === 'function' && typeof maybePromise.catch === 'function') {
            maybePromise.then(() => finish(null)).catch((/** @type {unknown} */ err) => finish(err));
          }
        } catch (err) {
          finish(err);
        }
      });
    } else {
      removePromise = new Promise((resolve, reject) => {
        let settled = false;
        /** @param {unknown} err */
        const finish = (err) => {
          if (settled) return;
          settled = true;
          if (!err || this.#isNoTorrentError(err) || this.#isLockLikeFsError(err)) {
            resolve();
            return;
          }
          reject(err);
        };

        try {
          t.destroy({ destroyStore: false }, finish);
        } catch (err) {
          finish(err);
        }
      });
    }

    return removePromise
      .then(async () => {
        if (!(destroyStore && downloadedTargets.length > 0)) {
          return {
            removedFromClient: true,
            deleteRequested: Boolean(destroyStore),
            deletedTargetCount: 0,
            lockedTargets: [],
            failedTargets: [],
          };
        }

        /** @param {number} ms */
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        /**
         * @typedef {{ deletedTargets: string[], lockedTargets: string[], failedTargets: string[] }} CleanupResult
         */

        /**
         * @param {CleanupResult} left
         * @param {CleanupResult} right
         * @returns {CleanupResult}
         */
        const mergeCleanup = (left, right) => ({
          deletedTargets: Array.from(new Set([...(left?.deletedTargets || []), ...(right?.deletedTargets || [])])),
          lockedTargets: Array.from(new Set([...(left?.lockedTargets || []), ...(right?.lockedTargets || [])])),
          failedTargets: Array.from(new Set([...(left?.failedTargets || []), ...(right?.failedTargets || [])])),
        });

        // Give WebTorrent/OS a brief moment to release file handles,
        // then start filesystem cleanup.
        await wait(300);

        // First pass after detach grace period.
        let cleanup = this.#removeDownloadedTargets(downloadedTargets);

        // Follow-up passes for Windows locks that clear shortly after handle close.
        const retryDelays = [900, 1800, 3200, 5000];
        for (const delayMs of retryDelays) {
          if (!Array.isArray(cleanup.lockedTargets) || cleanup.lockedTargets.length === 0) break;
          await wait(delayMs);
          const retryCleanup = this.#removeDownloadedTargets(cleanup.lockedTargets);
          cleanup = mergeCleanup(cleanup, retryCleanup);
        }

        const uniqueFailed = Array.from(new Set(cleanup.failedTargets || []));
        const uniqueLocked = Array.from(new Set(cleanup.lockedTargets || []))
          .filter((target) => !cleanup.deletedTargets.includes(target));

        return {
          removedFromClient: true,
          deleteRequested: Boolean(destroyStore),
          deletedTargetCount: cleanup.deletedTargets.length,
          lockedTargets: uniqueLocked,
          failedTargets: uniqueFailed,
        };
      })
      .catch((err) => {
        if (this.#isNoTorrentError(err) || this.#isLockLikeFsError(err)) {
          return {
            removedFromClient: true,
            deleteRequested: Boolean(destroyStore),
            deletedTargetCount: 0,
            lockedTargets: [],
            failedTargets: [],
          };
        }
        throw err;
      })
      .then((result) => {
        if (destroyStore && downloadedTargets.length > 0) {
          if (Array.isArray(result?.lockedTargets) && result.lockedTargets.length > 0) {
            console.warn('[TorrentController] Some downloaded targets are locked and could not be removed:', result.lockedTargets);
          }
          if (Array.isArray(result?.failedTargets) && result.failedTargets.length > 0) {
            console.warn('[TorrentController] Some downloaded targets failed to remove:', result.failedTargets);
          }
        }
        return result;
      })
      .finally(() => {
        if (hash) this.#preferredDisplayNames.delete(hash);
      }
    );
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
    this.#forcedPaused.clear();
    this.#preferredDisplayNames.clear();
    if (!client) return Promise.resolve();
    return new Promise((resolve) => client.destroy(resolve));
  }
}

module.exports = TorrentController;
