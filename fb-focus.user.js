// ==UserScript==
// @name         FB Focus — Messages Only
// @namespace    https://github.com/elsigmatom/focus-userscripts
// @version      1.0.0
// @description  Hide FB feed/reels/marketplace, redirect to /messages, kill reel rabbit holes, auto-clear notification badges
// @author       elsigmatom
// @match        https://*.facebook.com/*
// @match        https://*.messenger.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/elsigmatom/focus-userscripts/main/fb-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/elsigmatom/focus-userscripts/main/fb-focus.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 1. Hard redirect ----------
  // Land everything except /messages and active conversation URLs straight on /messages.
  const ALLOW_PATH = /^\/(messages|messenger|t|login|logout|help|settings|profile|me|friends\/requests|notifications|policies|privacy|business)/;
  const ON_FB = location.hostname.endsWith('facebook.com');
  const ON_MSGR = location.hostname.endsWith('messenger.com');
  if (ON_FB && !ALLOW_PATH.test(location.pathname) && location.pathname !== '/messages') {
    // Allow profile pages (/<username>) only if reached via DM click; everything else redirects.
    // Heuristic: redirect if pathname is empty OR matches a known feed/reels/marketplace path.
    if (location.pathname === '/' ||
        /^\/(home|watch|reels?|marketplace|gaming|memories|saved|groups\/feed|feed|stories|videos)\/?/.test(location.pathname)) {
      location.replace('https://www.facebook.com/messages');
      return;
    }
  }

  // ---------- 2. CSS hides ----------
  const HIDE_LABELS = [
    'Home', 'Reels', 'Marketplace', 'Watch', 'Video', 'Groups', 'Gaming',
    'Memories', 'Saved', 'Feeds', 'Notifications', 'Friend requests', 'Friends',
    'Pages', 'Events', 'Most recent', 'Live videos', 'Ad Center', 'Ads Manager',
    'Climate science center', 'Crisis response', 'Fundraisers', 'Recent ad activity'
  ];

  const css = `
    /* === Nav rail + top bar items by aria-label === */
    ${HIDE_LABELS.map(l => `[aria-label="${l}"]`).join(',\n    ')} { display: none !important; }

    /* Top bar shortcuts row (Home/Watch/Marketplace/Groups icons) */
    [role="navigation"] [role="tablist"] { display: none !important; }

    /* Red unread / new-notification badges */
    [aria-label*="unread" i],
    [aria-label*="new notification" i],
    [aria-label*="unseen" i] { display: none !important; }

    /* Right-rail sponsored / suggestion blocks on /messages */
    [role="complementary"] [aria-label="Sponsored"],
    [role="complementary"] [aria-label*="People you may know" i],
    [role="complementary"] [aria-label*="Marketplace" i],
    [role="complementary"] [aria-label*="Reels" i],
    [role="complementary"] [aria-label*="Suggested" i] { display: none !important; }

    /* Story tray on /messages */
    [aria-label="Stories"] { display: none !important; }

    /* JS-toggled hide classes */
    .__focus_hide { display: none !important; }
    .__focus_hide_preview { display: none !important; }
  `;

  function injectStyles() {
    if (document.getElementById('__focus_style')) return;
    const styleEl = document.createElement('style');
    styleEl.id = '__focus_style';
    styleEl.textContent = css;
    (document.head || document.documentElement).appendChild(styleEl);
  }
  injectStyles();
  // Re-inject if FB nukes it during hydration
  new MutationObserver(injectStyles).observe(document.documentElement, { childList: true, subtree: false });

  // ---------- 3. Thread-list preview behavior ----------
  // For each thread row in the conversation list:
  //   - Read   → hide the last-message preview line
  //   - Unread → leave it visible (name is bold by default)
  function processThreadRow(row) {
    if (!row || !row.querySelector) return;
    // Detect unread: any descendant span with computed font-weight >= 600,
    // OR explicit aria-label "unread"
    let isUnread = false;
    if (row.querySelector('[aria-label*="unread" i]')) {
      isUnread = true;
    } else {
      const spans = row.querySelectorAll('span');
      for (let i = 0; i < spans.length && i < 30; i++) {
        const fw = parseInt(getComputedStyle(spans[i]).fontWeight || '400', 10);
        if (fw >= 600) { isUnread = true; break; }
      }
    }
    // Find preview text nodes. FB uses [dir="auto"] for message content.
    // Index 0 = name. Index 1+ = preview line(s) and timestamp.
    // We hide preview lines but NOT the timestamp. Timestamps are short (e.g. "2h", "Mon").
    // Strategy: hide [dir="auto"] elements whose text is longer than 12 chars (heuristic for prose vs timestamp).
    const dirAuto = row.querySelectorAll('[dir="auto"]');
    for (let i = 1; i < dirAuto.length; i++) {
      const el = dirAuto[i];
      const txt = (el.textContent || '').trim();
      // Skip very short text (timestamps, online indicators)
      if (txt.length <= 8) continue;
      // Skip if it's the name row (already handled by index 0)
      if (isUnread) el.classList.remove('__focus_hide_preview');
      else el.classList.add('__focus_hide_preview');
    }
  }

  function scanThreadList() {
    // FB Messages inbox: role="grid" → role="row" children
    const rows = document.querySelectorAll('[role="row"]');
    rows.forEach(processThreadRow);
  }

  // ---------- 4. Reel scroll-close ----------
  let reelHandlersAttached = false;
  function isOnReel() {
    if (/^\/reels?\//.test(location.pathname)) return true;
    if (document.querySelector('[role="dialog"][aria-label*="reel" i]')) return true;
    if (document.querySelector('[data-pagelet*="Reel" i]')) return true;
    return false;
  }
  function closeReel() {
    const closeBtn = document.querySelector(
      '[role="dialog"][aria-label*="reel" i] [aria-label="Close"], ' +
      '[role="dialog"] [aria-label="Close"]'
    );
    if (closeBtn) { closeBtn.click(); return; }
    if (history.length > 1) history.back();
    else location.replace('https://www.facebook.com/messages');
  }
  function onReelScroll(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeReel();
    detachReelHandlers();
  }
  function onReelKey(e) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key)) {
      onReelScroll(e);
    }
  }
  function attachReelHandlers() {
    if (reelHandlersAttached) return;
    reelHandlersAttached = true;
    window.addEventListener('wheel', onReelScroll, { capture: true, passive: false });
    window.addEventListener('touchmove', onReelScroll, { capture: true, passive: false });
    window.addEventListener('keydown', onReelKey, { capture: true });
  }
  function detachReelHandlers() {
    if (!reelHandlersAttached) return;
    reelHandlersAttached = false;
    window.removeEventListener('wheel', onReelScroll, { capture: true });
    window.removeEventListener('touchmove', onReelScroll, { capture: true });
    window.removeEventListener('keydown', onReelKey, { capture: true });
  }
  function checkReel() {
    if (isOnReel()) attachReelHandlers();
    else detachReelHandlers();
  }

  // ---------- 5. Auto-mark-read (click fallback) ----------
  // Only runs when tab is hidden (document.hidden === true) so it doesn't disrupt active use.
  const NOTIF_INTERVAL_MS = 5 * 60 * 1000;
  let lastNotifRun = 0;
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function markNotificationsRead() {
    if (!document.hidden) return;
    if (Date.now() - lastNotifRun < NOTIF_INTERVAL_MS) return;
    lastNotifRun = Date.now();

    const bell = document.querySelector('[aria-label="Notifications"]');
    if (!bell) return;
    const clickable = bell.closest('[role="button"]') || bell;
    clickable.click();
    await sleep(1200);

    // Find "Mark all as read" in the opened panel
    const candidates = document.querySelectorAll('[role="menuitem"], [role="button"], [role="link"]');
    for (const b of candidates) {
      const txt = (b.textContent || '').trim().toLowerCase();
      if (txt === 'mark all as read' || txt.includes('mark all as read')) {
        b.click();
        break;
      }
    }
    await sleep(400);
    // Close panel via Escape
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // Messages: 30-min delay before auto-marking read, only when tab hidden.
  // Implementation: track first-seen timestamp per unread thread in localStorage.
  // After 30 min, click the thread (which marks it read + sends read receipt).
  const SEEN_KEY = '__focus_fb_unread_seen';
  const MARK_DELAY_MS = 30 * 60 * 1000;
  const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
  const saveSeen = s => localStorage.setItem(SEEN_KEY, JSON.stringify(s));

  async function markMessagesRead() {
    if (!document.hidden) return;
    const seen = loadSeen();
    const now = Date.now();
    const rows = document.querySelectorAll('[role="row"]');
    for (const row of rows) {
      let isUnread = false;
      if (row.querySelector('[aria-label*="unread" i]')) isUnread = true;
      else {
        const spans = row.querySelectorAll('span');
        for (let i = 0; i < spans.length && i < 30; i++) {
          const fw = parseInt(getComputedStyle(spans[i]).fontWeight || '400', 10);
          if (fw >= 600) { isUnread = true; break; }
        }
      }
      if (!isUnread) continue;
      // Use thread's stable identifier — aria-label or row text first 60 chars
      const id = row.getAttribute('aria-label') || (row.textContent || '').trim().slice(0, 60);
      if (!id) continue;
      if (!seen[id]) seen[id] = now;
      if (now - seen[id] >= MARK_DELAY_MS) {
        const clickTarget = row.querySelector('[role="link"], [role="button"]') || row;
        clickTarget.click();
        delete seen[id];
        await sleep(800);
        // After clicking, FB navigates to that thread. We're on /messages/t/<id> now.
        // No need to navigate back — user accepted this. Stop the loop to avoid more clicks this tick.
        break;
      }
    }
    // Prune entries older than 7 days (stale)
    for (const k of Object.keys(seen)) {
      if (now - seen[k] > 7 * 24 * 60 * 60 * 1000) delete seen[k];
    }
    saveSeen(seen);
  }

  // ---------- 6. Wire it up ----------
  function tick() {
    scanThreadList();
    checkReel();
    markNotificationsRead();
    markMessagesRead();
  }

  function start() {
    const obs = new MutationObserver(() => {
      scanThreadList();
      checkReel();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setInterval(tick, 60 * 1000);
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
