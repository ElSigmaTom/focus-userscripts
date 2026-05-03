// ==UserScript==
// @name         IG Focus — DMs Only
// @namespace    https://github.com/ElSigmaTom/focus-userscripts
// @version      1.0.0
// @description  Hide IG feed/reels/explore, redirect to /direct/inbox/, kill reel rabbit holes, auto-clear notification badges
// @author       ElSigmaTom
// @match        https://*.instagram.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 1. Hard redirect ----------
  // Allow: /direct/* (DMs), /<username>/ (profile from DM click), /p/* (post share),
  //        /accounts/* (settings/logout), /reel/* via DM share viewer (handled in reel-close).
  // Redirect: /, /reels/, /reels?/, /explore/, /stories/<id>/ (when not from DM)
  const PATH = location.pathname;
  if (location.hostname.endsWith('instagram.com')) {
    if (PATH === '/' ||
        /^\/(reels?|explore|stories)\/?$/.test(PATH) ||
        /^\/(reels?|explore)\//.test(PATH)) {
      // /reel/<id>/ (singular) is allowed because that's the URL when GF shares a reel in DM and you click it.
      // Block /reels/ (plural feed) and /explore/.
      if (!/^\/reel\/[^/]+\/?$/.test(PATH)) {
        location.replace('https://www.instagram.com/direct/inbox/');
        return;
      }
    }
  }

  // ---------- 2. CSS hides ----------
  const css = `
    /* Left nav rail items — hide all except Direct, Profile, More */
    a[href="/"],
    a[href="/explore/"],
    a[href="/reels/"],
    a[href^="/explore/"],
    [aria-label="Home"],
    [aria-label="Search"],
    [aria-label="Explore"],
    [aria-label="Reels"],
    [aria-label="Notifications"],
    [aria-label="New post"],
    [aria-label="Create"],
    [aria-label="Threads"],
    [aria-label="AI Studio"],
    [aria-label*="Meta AI" i] { display: none !important; }

    /* Red unread dots / activity badges */
    [aria-label*="unread" i],
    [aria-label*="unseen" i],
    [aria-label*="new notification" i],
    [aria-label*="new activity" i] { display: none !important; }

    /* Stories tray inside DM inbox (top horizontal scroller) */
    [role="menu"][aria-label*="Stories" i],
    section[role="main"] > div > div > [aria-label*="Stories" i] { display: none !important; }

    /* JS-toggled hides */
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
  new MutationObserver(injectStyles).observe(document.documentElement, { childList: true, subtree: false });

  // ---------- 3. Thread-list preview behavior ----------
  // IG DM inbox: rows are typically <div role="listitem"> or <a href="/direct/t/<id>/">
  // Preview = last message text. Read rows lighter weight, unread rows bold.
  function processThreadRow(row) {
    if (!row || !row.querySelector) return;
    let isUnread = false;
    // IG sometimes uses a small blue dot — find any aria-label containing "unread"
    if (row.querySelector('[aria-label*="unread" i]')) {
      isUnread = true;
    } else {
      const spans = row.querySelectorAll('span');
      for (let i = 0; i < spans.length && i < 30; i++) {
        const fw = parseInt(getComputedStyle(spans[i]).fontWeight || '400', 10);
        if (fw >= 600) { isUnread = true; break; }
      }
    }
    // IG row text structure: <div>Name</div><div>preview · timestamp</div>
    // We hide the second <div>'s preview span when read.
    // Simple heuristic: hide every <span> whose text length > 8 (skip name + timestamp),
    // EXCEPT the first one (name).
    const spans = row.querySelectorAll('span');
    let nameSpanSkipped = false;
    for (const sp of spans) {
      const txt = (sp.textContent || '').trim();
      if (!nameSpanSkipped && txt.length > 0) { nameSpanSkipped = true; continue; }
      if (txt.length <= 8) continue;
      if (isUnread) sp.classList.remove('__focus_hide_preview');
      else sp.classList.add('__focus_hide_preview');
    }
  }

  function scanThreadList() {
    const rows = document.querySelectorAll(
      'a[href^="/direct/t/"], div[role="listitem"], div[role="row"]'
    );
    rows.forEach(processThreadRow);
  }

  // ---------- 4. Reel scroll-close ----------
  let reelHandlersAttached = false;
  function isOnReel() {
    if (/^\/reels?\//.test(location.pathname)) return true;
    // IG reel viewer can also appear as a fullscreen dialog inside DMs
    if (document.querySelector('section main article video')) {
      // Heuristic: reel viewers have full-height video with no comment composer below
      const v = document.querySelector('section main article video');
      if (v && v.videoHeight > v.videoWidth) return true; // vertical video
    }
    return false;
  }
  function closeReel() {
    const closeBtn = document.querySelector('svg[aria-label="Close"]')?.closest('[role="button"], button, a');
    if (closeBtn) { closeBtn.click(); return; }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setTimeout(() => {
      if (isOnReel()) {
        if (history.length > 1) history.back();
        else location.replace('https://www.instagram.com/direct/inbox/');
      }
    }, 300);
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

  // ---------- 5. Auto-mark-read ----------
  // IG approach: try direct API for DMs, click-fallback for notifications.
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Notifications (activity tab): click the heart icon when hidden, then close.
  const NOTIF_INTERVAL_MS = 5 * 60 * 1000;
  let lastNotifRun = 0;
  async function markNotificationsRead() {
    if (!document.hidden) return;
    if (Date.now() - lastNotifRun < NOTIF_INTERVAL_MS) return;
    lastNotifRun = Date.now();
    // IG marks activity read just by opening the panel. Click then Escape.
    const heart = document.querySelector('[aria-label="Notifications"], svg[aria-label="Notifications"]');
    const btn = heart?.closest('a, [role="button"], button') || heart;
    if (!btn) return;
    btn.click();
    await sleep(1500);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // If clicking opened a /notifications/ route, navigate back
    if (/^\/notifications/.test(location.pathname)) {
      history.back();
    }
  }

  // DMs: try direct API first, fall back to click.
  const SEEN_KEY = '__focus_ig_unread_seen';
  const MARK_DELAY_MS = 30 * 60 * 1000;
  const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
  const saveSeen = s => localStorage.setItem(SEEN_KEY, JSON.stringify(s));

  async function tryApiMarkRead() {
    const csrf = getCookie('csrftoken');
    if (!csrf) return false;
    try {
      const inboxRes = await fetch('/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&persistentBadging=true', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-csrftoken': csrf,
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest'
        }
      });
      if (!inboxRes.ok) return false;
      const data = await inboxRes.json();
      const threads = data?.inbox?.threads || [];
      const seen = loadSeen();
      const now = Date.now();
      let didMark = false;
      for (const t of threads) {
        if (!t.read_state) continue; // 0 = read
        const id = t.thread_id;
        const lastItem = t.items?.[0];
        if (!lastItem) continue;
        if (!seen[id]) seen[id] = now;
        if (now - seen[id] >= MARK_DELAY_MS) {
          // POST seen
          await fetch(`/api/v1/direct_v2/threads/${id}/items/${lastItem.item_id}/seen/`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'x-csrftoken': csrf,
              'x-ig-app-id': '936619743392459',
              'x-requested-with': 'XMLHttpRequest'
            },
            body: 'use_unified_inbox=true'
          }).catch(() => {});
          delete seen[id];
          didMark = true;
        }
      }
      // prune
      for (const k of Object.keys(seen)) {
        if (now - seen[k] > 7 * 24 * 60 * 60 * 1000) delete seen[k];
      }
      saveSeen(seen);
      return didMark || true; // API path worked even if nothing eligible to mark
    } catch (e) {
      console.warn('[ig-focus] API mark-read failed:', e);
      return false;
    }
  }

  async function clickFallbackMarkRead() {
    if (!document.hidden) return;
    const seen = loadSeen();
    const now = Date.now();
    const rows = document.querySelectorAll('a[href^="/direct/t/"]');
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
      const id = row.getAttribute('href');
      if (!id) continue;
      if (!seen[id]) seen[id] = now;
      if (now - seen[id] >= MARK_DELAY_MS) {
        row.click();
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

  async function markMessagesRead() {
    const apiOk = await tryApiMarkRead();
    if (!apiOk) await clickFallbackMarkRead();
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
