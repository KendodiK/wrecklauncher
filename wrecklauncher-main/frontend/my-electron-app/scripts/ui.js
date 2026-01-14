/*
 * scripts/ui.js
 * Responsibilities:
 * - Wire toolbar window buttons to the Electron API (via preload/contextBridge).
 * - Provide light-weight client-side navigation (back/forward stacks using sessionStorage).
 * - Provide a small hover dropdown on the app icon for a few actions.
 *
 * Notes:
 * - The file prefers `window.electronAPI` (set by a secure preload) but falls back
 *   to other common patterns for compatibility.
 */

(function () {
  // Generic cross-context invoke helper.
  // Tries: contextBridge -> legacy window.api -> require('electron').ipcRenderer -> postMessage fallback
  async function invoke(channel) {
    // Try contextBridge exposed APIs (common preload patterns)
    try {
      if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
        return window.electronAPI.invoke(channel);
      }
      if (window.api && typeof window.api.invoke === 'function') {
        return window.api.invoke(channel);
      }
    } catch (e) {
      // ignore errors when probing for APIs
    }

    // Try require('electron').ipcRenderer if available (legacy / nodeIntegration)
    try {
      if (typeof window.require === 'function') {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
          return ipcRenderer.invoke(channel);
        }
      }
    } catch (e) {
      // ignore
    }

    // Fallback: postMessage so an outer host can listen
    window.postMessage({ type: 'app:invoke', channel }, '*');
    console.log('Fallback invoke:', channel);
  }

  // Main initializer for the toolbar and navigation behaviors.
  function setupToolbar() {
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');

    // Prefer direct, exposed methods from preload for clarity/performance
    if (window.electronAPI) {
      minBtn?.addEventListener('click', () => window.electronAPI.minimize());
      maxBtn?.addEventListener('click', () => window.electronAPI.maximize());
      closeBtn?.addEventListener('click', () => window.electronAPI.close());
    } else {
      // Fallback to generic invoke (supports older preload patterns)
      minBtn?.addEventListener('click', () => invoke('window:minimize'));
      maxBtn?.addEventListener('click', () => invoke('window:maximize'));
      closeBtn?.addEventListener('click', () => invoke('window:close'));
    }

     /* Navigation handling: back/forward and alias mapping
       - Home maps to Store, Store maps to Index (aliasing for user expectations).
       - We maintain two stacks in sessionStorage: BACK_KEY and FORWARD_KEY.
       - Navigation functions below push/pop these stacks and then update `location.href`.
     */
    const BACK_KEY = 'navBack';
    const FORWARD_KEY = 'navForward';

    // Return the filename portion of a URL or href string (e.g. '/path/index.html' -> 'index.html')
    function filenameFrom(href) {
      try {
        const u = new URL(href, location.href);
        return u.pathname.split('/').pop();
      } catch (e) {
        // Fallback for relative paths or odd strings
        return String(href).split('/').pop();
      }
    }

    // Apply simple aliasing rules used by the app
    function resolveAlias(filename) {
      if (!filename) return filename;
      if (filename === 'home.html') return 'store.html';
      if (filename === 'store.html') return 'index.html';
      return filename;
    }

    // Helpers for storing simple arrays as JSON in sessionStorage
    function readStack(key) {
      try {
        return JSON.parse(sessionStorage.getItem(key) || '[]');
      } catch (e) {
        return [];
      }
    }

    function writeStack(key, arr) {
      sessionStorage.setItem(key, JSON.stringify(arr || []));
    }

    // Ensure the current (alias-resolved) location is present at the end of the back stack.
    // We intentionally do not clear the forward stack here (only on explicit navigation).
    function pushCurrentToBack() {
      const current = resolveAlias(filenameFrom(location.href));
      const back = readStack(BACK_KEY);
      if (back[back.length - 1] !== current) back.push(current);
      writeStack(BACK_KEY, back);
      console.debug('[nav] pushCurrentToBack:', { current, back });
    }

    // Navigate to a filename, applying aliasing and updating both stacks.
    // This clears the forward stack (as a typical navigation does).
    function navigateTo(filename) {
      const target = resolveAlias(filename);
      if (!target) return;
      const back = readStack(BACK_KEY);
      if (back[back.length - 1] !== target) back.push(target);
      writeStack(BACK_KEY, back);
      writeStack(FORWARD_KEY, []);
      console.debug('[nav] navigateTo:', { target, back });
      location.href = target;
    }

    // Move one step back in our sessionStorage-backed history.
    function goBack() {
      const back = readStack(BACK_KEY);
      const forward = readStack(FORWARD_KEY);
      if (back.length <= 1) return; // nothing to go back to
      const current = back.pop();
      forward.push(current);
      const prev = back[back.length - 1];
      writeStack(BACK_KEY, back);
      writeStack(FORWARD_KEY, forward);
      console.debug('[nav] goBack:', { prev, back, forward });
      location.href = prev;
    }

    // Move one step forward if available.
    function goForward() {
      const back = readStack(BACK_KEY);
      const forward = readStack(FORWARD_KEY);
      if (forward.length === 0) return;
      const next = forward.pop();
      back.push(next);
      writeStack(BACK_KEY, back);
      writeStack(FORWARD_KEY, forward);
      console.debug('[nav] goForward:', { next, back, forward });
      location.href = next;
    }

    // Navigation anchors and app-icon dropdown are handled below. All other
    // dropdown/modal related helpers were removed to keep the UI minimal.

    // Create a small hover dropdown for the app icon only. Other toolbar links
    // are simple navigations.
    const appIcon = document.querySelector('a.app-icon-link');
    if (appIcon) {
      const dd = document.createElement('div');
      dd.className = 'app-icon-dropdown';

      // Dropdown entries and their actions
      const items = [
        { label: 'Home', action: () => navigateTo('index.html') },
        { label: 'Settings', action: () => navigateTo('settings.html') },
        { label: 'Check for Updates', action: () => console.log('Check for Updates (placeholder)') },
        { label: 'Go Offline / Go Online', action: () => console.log('Toggle Offline/Online (placeholder)') },
        { label: 'Exit Application', action: () => {
          try {
            if (window.electronAPI && typeof window.electronAPI.close === 'function') {
              window.electronAPI.close();
            } else {
              invoke('window:close');
            }
          } catch (e) { console.error('Exit error', e); }
        } }
      ];

      items.forEach(it => {
        const el = document.createElement('div');
        el.className = 'menu-item';
        el.textContent = it.label;
        el.addEventListener('click', (e) => {
          // Prevent the anchor's default navigation (menu lives inside the app-icon anchor)
          if (e.preventDefault) e.preventDefault();
          e.stopPropagation();
          dd.style.display = 'none';
          it.action();
        });
        dd.appendChild(el);
      });

      // Attach dropdown to the app icon
      appIcon.style.position = 'relative';
      dd.style.display = 'none';
      appIcon.appendChild(dd);

      // Show on hover/focus, hide on leave/blur
      appIcon.addEventListener('mouseenter', () => { dd.style.display = 'block'; });
      appIcon.addEventListener('mouseleave', () => { dd.style.display = 'none'; });
      appIcon.addEventListener('focus', () => { dd.style.display = 'block'; }, true);
      appIcon.addEventListener('blur', () => { dd.style.display = 'none'; }, true);

      // Close dropdown when clicking elsewhere
      document.addEventListener('click', (e) => {
        if (!e.target.closest('a.app-icon-link') && !e.target.closest('.app-icon-dropdown')) {
          dd.style.display = 'none';
        }
      });
    }

    // Simplified anchor handling for standard nav items: navigate directly
    const menuAnchors = Array.from(document.querySelectorAll('a.nav-item'));
    menuAnchors.forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const fname = filenameFrom(a.getAttribute('href') || a.href);
        navigateTo(fname);
      });
    });

    // Wire the arrow/back buttons
    const backBtn = document.querySelector('button[aria-label="Back"]');
    const forwardBtn = document.querySelector('button[aria-label="Forward"]');
    backBtn?.addEventListener('click', () => goBack());
    forwardBtn?.addEventListener('click', () => goForward());

    // Ensure current page is present in back stack on load
    pushCurrentToBack();

    // Log navigation clicks and add ARIA support
    document.querySelectorAll('.nav-item-btn, .nav-item').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const label = el.getAttribute('aria-label') || el.textContent?.trim() || el.alt || 'nav-item';
        console.log('Nav click:', label);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          el.click();
        }
      });
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });

    // Optional keyboard shortcut example
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'F4') invoke('window:close');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToolbar);
  } else {
    setupToolbar();
  }
})();
