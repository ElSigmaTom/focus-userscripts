// ==UserScript==
// @name         FB Focus — Messages Only
// @namespace    https://github.com/ElSigmaTom/focus-userscripts
// @version      2.0.1
// @description  Strip FB to /messages only. Hide nav/badges/feed/reels/marketplace. Redirect home to messages. Force-close reels on scroll. Auto-mark-read.
// @author       ElSigmaTom
// @match        https://*.facebook.com/*
// @match        https://*.messenger.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[FB-FOCUS]';
  const log = (...args) => console.log(TAG, ...args);
  log('v2.0.1 loaded at', location.href);

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
    if (row.querySelector('[aria-label*="unread" i]')) return true;
    const spans = row.querySelectorAll('span');
    let n = 0;
    for (const s of spans) {
      if (++n > 30) break;
      const fw = parseInt(getComputedStyle(s).fontWeight || '400', 10);
      if (fw >= 600) return true;
    }
    return false;
  }

  function processThreadRow(row) {
    const unread = isRowUnread(row);
    // Find prose-length text nodes (preview lines, not name/timestamp)
    const candidates = row.querySelectorAll('[dir="auto"], span');
    let nameSeen = false;
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      if (!nameSeen) { nameSeen = true; continue; } // skip name (first non-empty)
      if (txt.length <= 8) continue; // skip timestamp / online dots
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

  async function markNotificationsRead() {
    if (!document.hidden) return;
    if (Date.now() - lastNotif < NOTIF_INTERVAL) return;
    lastNotif = Date.now();
    log('Attempting notification mark-read');
    const bell = document.querySelector('[aria-label="Notifications"]');
    if (!bell) { log('No notification bell found'); return; }
    (bell.closest('[role="button"]') || bell).click();
    await sleep(1500);
    const items = document.querySelectorAll('[role="menuitem"], [role="button"], [role="link"]');
    for (const b of items) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'mark all as read' || t.startsWith('mark all as read')) {
        b.click();
        log('Clicked Mark all as read');
        break;
      }
    }
    await sleep(400);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
  function saveSeen(s) { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); }

  async function markMessagesRead() {
    if (!document.hidden) return;
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
    markNotificationsRead();
    markMessagesRead();
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
    // MutationObserver for SPA navigation re-renders
    const obs = new MutationObserver(() => {
      hideNavByText();
      scanThreadList();
      checkReel();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
