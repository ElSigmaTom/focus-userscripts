// ==UserScript==
// @name         FB Focus — Messages Only
// @namespace    https://github.com/ElSigmaTom/focus-userscripts
// @version      2.1.1
// @description  Strip FB to /messages only. Hide nav/badges/feed/reels/marketplace. Redirect home to messages. Force-close reels on scroll. Auto-mark-read.
// @author       ElSigmaTom
// @match        https://facebook.com/*
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://messenger.com/*
// @match        https://www.messenger.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[FB-FOCUS]';
  const log = (...args) => console.log(TAG, ...args);
  log('v2.1.1 loaded at', location.href);
  console.warn('[FB-FOCUS] USERSCRIPT IS RUNNING:', {
    href: location.href,
    readyState: document.readyState,
    hidden: document.hidden
  });

  const TEST_MODE = false;
  const ENABLE_AUTO_MARK_READ = false;

  // =========================================================
  // 1. HARD REDIRECT (runs at document-start, before paint)
  // =========================================================
  const PATH = location.pathname;
  const ON_FB = location.hostname.endsWith('facebook.com');

  // Allow these paths to render normally
  const ALLOW = /^\/(messages|messenger|t|login|logout|recover|checkpoint|help|policies|privacy|business|settings|me|profile\.php|friends\/requests|notifications)/;

  // Force-redirect these paths to /messages
  const REDIRECT = /^\/(home|watch|reels?|marketplace|gaming|memories|saved|groups\/feed|feed|stories|videos|live|events|fundraisers|crisisresponse|gameroom|hashtag|trending)\/?/;

  if (ON_FB) {
    if (PATH === '/' || REDIRECT.test(PATH) || (!ALLOW.test(PATH) && PATH.length <= 2)) {
      log('Redirecting from', PATH, '→ /messages');
      location.replace('https://www.facebook.com/messages');
      return;
    }
  }

  // =========================================================
  // 2. CSS HIDES — runs at document-start, applies before paint
  // =========================================================
  const CSS = `
    /* Hide-by-attribute classes (toggled in JS) */
    .__ff_hide { display: none !important; }
    .__ff_hide_preview { display: none !important; }

    /* Direct attribute selectors for nav items */
    [aria-label="Marketplace"][role="link"],
    [aria-label="Watch"][role="link"],
    [aria-label="Reels"][role="link"],
    [aria-label="Home"][role="link"],
    [aria-label="Groups"][role="link"],
    [aria-label="Gaming"][role="link"],
    [aria-label="Video"][role="link"],
    [aria-label="Memories"][role="link"],
    [aria-label="Saved"][role="link"],
    [aria-label="Friends"][role="link"],
    [aria-label="Friend requests"],
    [aria-label="Notifications"],
    [aria-label="Stories"][role="link"] { display: none !important; }

    /* Top-bar shortcut tab list */
    [role="navigation"] [role="tablist"] { display: none !important; }

    /* Red unread dot badges */
    [aria-label*="unread" i],
    [aria-label*="unseen" i],
    [aria-label*="new notification" i] { display: none !important; }

    /* Right rail sponsored / suggestions on /messages */
    [role="complementary"] [aria-label*="Sponsored" i],
    [role="complementary"] [aria-label*="Marketplace" i],
    [role="complementary"] [aria-label*="Reels" i],
    [role="complementary"] [aria-label*="People you may know" i] { display: none !important; }

    /* Floating debug indicator */
    #__ff_indicator {
      position: fixed; bottom: 12px; right: 12px; z-index: 99999;
      background: rgba(20,20,20,0.85); color: #6f6; font: 11px/1.2 monospace;
      padding: 4px 8px; border-radius: 4px; pointer-events: none;
    }
  `;

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById && document.getElementById('__ff_style')) return;
    const target = document.head || document.documentElement;
    if (!target) {
      // documentElement not ready yet (true at @run-at document-start) — retry
      setTimeout(injectStyles, 5);
      return;
    }
    const s = document.createElement('style');
    s.id = '__ff_style';
    s.textContent = CSS;
    target.appendChild(s);
    log('CSS injected');
    // Re-inject if FB removes it during hydration (only attach observer after documentElement exists)
    if (!window.__ff_obs && document.documentElement) {
      window.__ff_obs = new MutationObserver(injectStyles);
      window.__ff_obs.observe(document.documentElement, { childList: true });
    }
  }
  injectStyles();

  // =========================================================
  // 3. TEXT-CONTENT-BASED NAV HIDING
  // (proven approach from Freyam Mehta's "Hide Facebook Reels Completely")
  // =========================================================
  // Phrases that identify nav items / sections to hide.
  // We find any <span> containing the text, then climb up to a stable parent (link or list item)
  const HIDE_NAV_TEXTS = [
    'Reels and short videos',
    'Marketplace',
    'Watch',
    'Reels',
    'Groups',
    'Gaming',
    'Friends',
    'Memories',
    'Saved',
    'Events',
    'Live videos',
    'Most recent',
    'Pages',
    'Notifications',
    'Friend requests',
    'Stories'
  ];

  function hideClimbing(el) {
    // Climb to nearest [role="link"] or [role="listitem"] or div with link inside
    let target = el.closest('[role="link"]') ||
                 el.closest('[role="listitem"]') ||
                 el.closest('a[role="presentation"]') ||
                 el.closest('div[class*="x1qughib"]') ||
                 el.closest('div[class*="x1lliihq"]') ||
                 el.parentElement?.parentElement?.parentElement?.parentElement;
    if (target && !target.classList.contains('__ff_hide')) {
      target.classList.add('__ff_hide');
      return true;
    }
    return false;
  }

  function hideNavByText() {
    let hidden = 0;
    const spans = document.querySelectorAll('span:not(.__ff_seen)');
    for (const span of spans) {
      const txt = (span.textContent || '').trim();
      if (txt.length === 0 || txt.length > 50) continue;
      if (HIDE_NAV_TEXTS.includes(txt)) {
        if (hideClimbing(span)) hidden++;
      }
      span.classList.add('__ff_seen'); // skip on next pass
    }
    if (hidden) log('Hid', hidden, 'nav items by text');
  }

  // =========================================================
  // 4. THREAD-LIST CONDITIONAL PREVIEW
  // Read threads → hide preview text. Unread → leave it.
  // =========================================================
  function isRowUnread(row) {
    // Check for aria-label unread indicator
    if (row.querySelector('[aria-label*="unread" i]')) return true;
    // Check for small blue/filled dot (FB's unread marker)
    const els = row.querySelectorAll('div, span');
    for (const d of els) {
      const r = d.getBoundingClientRect();
      if (r.width < 6 || r.width > 16 || r.height < 6 || r.height > 16) continue;
      const bg = getComputedStyle(d).backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
      const m = bg.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (m && +m[3] > 180 && +m[1] < 120 && +m[2] < 180) return true;
    }
    // Don't use font-weight — FB always bolds the name even on read threads
    return false;
  }

  function processThreadRow(row) {
    const unread = isRowUnread(row);
    // [dir="auto"] is FB's attribute for user-facing text spans.
    // Filter to top-level only (not nested inside another [dir="auto"]).
    // First top-level = name. Everything after = preview / timestamp / metadata.
    const all = Array.from(row.querySelectorAll('[dir="auto"]'));
    const topLevel = all.filter(el => {
      let p = el.parentElement;
      while (p && p !== row) {
        if (p.getAttribute && p.getAttribute('dir') === 'auto') return false;
        p = p.parentElement;
      }
      return true;
    });
    let nameFound = false;
    for (const el of topLevel) {
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      if (!nameFound) { nameFound = true; continue; }
      if (unread) el.classList.remove('__ff_hide_preview');
      else el.classList.add('__ff_hide_preview');
    }
  }

  function scanThreadList() {
    const rows = document.querySelectorAll('[role="row"], [role="gridcell"][data-testid*="conversation" i]');
    rows.forEach(processThreadRow);
  }

  // =========================================================
  // 5. REEL VIEWER — FORCE CLOSE ON SCROLL
  // =========================================================
  let reelAttached = false;

  function isOnReel() {
    if (/^\/reels?\//.test(location.pathname)) return true;
    if (document.querySelector('[role="dialog"][aria-label*="reel" i]')) return true;
    if (document.querySelector('[data-pagelet*="Reel" i]')) return true;
    return false;
  }

  function closeReel() {
    log('Closing reel');
    const closeBtn = document.querySelector(
      '[role="dialog"] [aria-label="Close"], ' +
      '[role="dialog"] [aria-label*="close" i]'
    );
    if (closeBtn) { closeBtn.click(); return; }
    if (history.length > 1) history.back();
    else location.replace('https://www.facebook.com/messages');
  }

  function onReelEvent(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeReel();
    detachReel();
  }

  function onReelKey(e) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar'].includes(e.key)) {
      onReelEvent(e);
    }
  }

  function attachReel() {
    if (reelAttached) return;
    reelAttached = true;
    window.addEventListener('wheel', onReelEvent, { capture: true, passive: false });
    window.addEventListener('touchmove', onReelEvent, { capture: true, passive: false });
    window.addEventListener('keydown', onReelKey, { capture: true });
    log('Reel handlers attached');
  }

  function detachReel() {
    if (!reelAttached) return;
    reelAttached = false;
    window.removeEventListener('wheel', onReelEvent, { capture: true });
    window.removeEventListener('touchmove', onReelEvent, { capture: true });
    window.removeEventListener('keydown', onReelKey, { capture: true });
  }

  function checkReel() {
    if (isOnReel()) attachReel();
    else detachReel();
  }

  // =========================================================
  // 6. AUTO-MARK-READ — click fallback (only when tab hidden)
  // =========================================================
  const NOTIF_INTERVAL = 5 * 60 * 1000;
  const MARK_DELAY = 30 * 60 * 1000;
  let lastNotif = 0;
  const SEEN_KEY = '__ff_seen';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function getDtsg() {
    // fb_dtsg token — needed for all FB API calls
    const el = document.querySelector('input[name="fb_dtsg"]');
    if (el) return el.value;
    const m = document.documentElement.innerHTML.match(/"DTSGInitialData"[^}]*"token"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    const m2 = document.documentElement.innerHTML.match(/\["DTSGInitData",\[\],\{"token":"([^"]+)"/);
    if (m2) return m2[1];
    return null;
  }

  async function markNotificationsRead() {
    if (!TEST_MODE && !document.hidden) return;
    if (Date.now() - lastNotif < NOTIF_INTERVAL) return;
    lastNotif = Date.now();
    log('Attempting notification mark-read');

    // Strategy 1: GraphQL API (works on any FB page including E2EE)
    const dtsg = getDtsg();
    if (dtsg) {
      try {
        const body = new URLSearchParams({
          fb_dtsg: dtsg,
          __a: '1'
        });
        const res = await fetch('/notifications/mark_read/', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        log('API mark-read status:', res.status);
        if (res.ok) return;
      } catch (e) { log('API mark-read failed:', e); }
    } else {
      log('No fb_dtsg token found');
    }

    // Strategy 2: Click the bell (fallback, only works if bell exists)
    const bell = document.querySelector('[aria-label*="Notification" i]');
    if (!bell) { log('No notification bell found either'); return; }
    const btn = bell.closest('[role="button"]') || bell;
    const hiddenAncestors = [];
    let el = btn;
    while (el && el !== document.body) {
      if (el.classList.contains('__ff_hide')) {
        el.classList.remove('__ff_hide');
        hiddenAncestors.push(el);
      }
      el = el.parentElement;
    }
    btn.style.cssText = 'position:fixed!important;left:-9999px!important;top:0!important;opacity:0.01!important;pointer-events:auto!important;display:flex!important;';
    btn.click();
    log('Bell clicked (off-screen)');
    await sleep(2000);
    const items = document.querySelectorAll('[role="menuitem"], [role="button"], [role="link"], span');
    let found = false;
    for (const b of items) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'mark all as read' || t === 'mark all notifications as read') {
        (b.closest('[role="menuitem"]') || b.closest('[role="button"]') || b).click();
        log('Clicked Mark all as read');
        found = true;
        break;
      }
    }
    if (!found) log('Mark all as read button not found');
    await sleep(400);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    btn.style.cssText = '';
    for (const a of hiddenAncestors) a.classList.add('__ff_hide');
  }

  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
  function saveSeen(s) { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); }

  async function markMessagesRead() {
    if (!TEST_MODE && !document.hidden) return;
    const seen = loadSeen();
    const now = Date.now();
    const rows = document.querySelectorAll('[role="row"]');
    for (const row of rows) {
      if (!isRowUnread(row)) continue;
      const id = row.getAttribute('aria-label') || (row.textContent || '').trim().slice(0, 60);
      if (!id) continue;
      if (!seen[id]) { seen[id] = now; continue; }
      if (now - seen[id] >= MARK_DELAY) {
        log('Marking thread read after delay:', id.slice(0, 30));
        const tgt = row.querySelector('[role="link"], [role="button"]') || row;
        tgt.click();
        delete seen[id];
        await sleep(800);
        break;
      }
    }
    for (const k of Object.keys(seen)) {
      if (now - seen[k] > 7 * 24 * 60 * 60 * 1000) delete seen[k];
    }
    saveSeen(seen);
  }

  // =========================================================
  // 7. DEBUG INDICATOR (so user sees the script is alive)
  // =========================================================
  function showIndicator() {
    if (document.getElementById('__ff_indicator')) return;
    if (!document.body) return;
    const i = document.createElement('div');
    i.id = '__ff_indicator';
    i.textContent = 'FB Focus v2 ✓';
    document.body.appendChild(i);
    log('Indicator shown');
  }

  // =========================================================
  // 8. RUN LOOP
  // =========================================================
  function tick() {
    showIndicator();
    hideNavByText();
    scanThreadList();
    checkReel();
    if (ENABLE_AUTO_MARK_READ) {
      markNotificationsRead();
      markMessagesRead();
    }
  }

  function start() {
    log('start() running');
    showIndicator();
    // Aggressive scan on first 10 seconds (FB hydrates async)
    let count = 0;
    const fast = setInterval(() => {
      hideNavByText();
      scanThreadList();
      checkReel();
      if (++count >= 10) clearInterval(fast);
    }, 1000);
    // Steady scan
    setInterval(tick, 60 * 1000);
    // MutationObserver for SPA navigation re-renders — debounced via rAF
    let mutationQueued = false;
    const obs = new MutationObserver(() => {
      if (mutationQueued) return;
      mutationQueued = true;
      requestAnimationFrame(() => {
        mutationQueued = false;
        tick();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    tick();
  }

  function startWhenReady() {
    if (window.__ff_started) return;
    if (!document.body) {
      requestAnimationFrame(startWhenReady);
      return;
    }
    window.__ff_started = true;
    start();
  }
  startWhenReady();
})();
