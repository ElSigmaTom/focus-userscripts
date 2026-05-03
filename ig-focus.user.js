// ==UserScript==
// @name         IG Focus — DMs Only
// @namespace    https://github.com/ElSigmaTom/focus-userscripts
// @version      2.0.5
// @description  Strip IG to /direct/inbox/ only. Hide nav/badges/feed/reels/explore/stories. Force-close reels on scroll. Auto-mark-read.
// @author       ElSigmaTom
// @match        https://instagram.com/*
// @match        https://www.instagram.com/*
// @match        https://m.instagram.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[IG-FOCUS]';
  const log = (...args) => console.log(TAG, ...args);
  log('v2.0.5 loaded at', location.href);
  console.warn('[IG-FOCUS] USERSCRIPT IS RUNNING:', {
    href: location.href,
    readyState: document.readyState,
    hidden: document.hidden
  });

  // TEST_MODE: when true, auto-mark-read fires even if tab is active (so you
  // can see logs without backgrounding the tab). Flip back to false in normal use.
  const TEST_MODE = true;

  // =========================================================
  // 1. HARD REDIRECT (document-start)
  // =========================================================
  const PATH = location.pathname;

  // Allowed paths: /direct/* (DMs), /accounts/* (settings/logout),
  // /<username>/ (profile), /p/<id>/ (post share), /reel/<id>/ (singular reel share from DM)
  const REDIRECT_PATHS = [
    /^\/$/,
    /^\/explore\/?/,
    /^\/explore\/.*/,
    /^\/reels\/?$/,
    /^\/reels\/.*/,
    /^\/stories\/?/  // /stories/ index, but NOT /stories/<username>/<id>/ from DM share
  ];

  if (location.hostname.endsWith('instagram.com')) {
    const shouldRedirect = REDIRECT_PATHS.some(re => re.test(PATH)) &&
                          !/^\/reel\/[^/]+\/?$/.test(PATH); // allow /reel/<id>/ singular
    if (shouldRedirect) {
      log('Redirecting from', PATH, '→ /direct/inbox/');
      location.replace('https://www.instagram.com/direct/inbox/');
      return;
    }
  }

  // =========================================================
  // 2. CSS — applied at document-start
  // =========================================================
  const CSS = `
    /* JS-toggled hide classes */
    .__if_hide { display: none !important; }
    .__if_hide_preview { display: none !important; }

    /* Direct sidebar link selectors (proven by highda) */
    a[href="/"] svg[aria-label="Home"],
    svg[aria-label="Search"],
    svg[aria-label="Explore"],
    svg[aria-label="Reels"],
    svg[aria-label="Notifications"],
    svg[aria-label="New post"],
    svg[aria-label="Create"],
    svg[aria-label="Threads"],
    svg[aria-label*="Meta AI" i],
    svg[aria-label="AI Studio"] {
      /* Hide the SVG itself as fallback */
      opacity: 0 !important;
    }

    /* Top-level link wrappers (highda-style) */
    a[href="/"][role="link"]:not([href*="/direct"]):not([href*="/accounts"]),
    a[href="/explore/"],
    a[href="/reels/"],
    a[href^="/explore/"]:not([href*="/direct"]) { display: none !important; }

    /* Red unread dots / activity badges */
    [aria-label*="unread" i],
    [aria-label*="unseen" i],
    [aria-label*="new notification" i],
    [aria-label*="new activity" i] { display: none !important; }

    /* Force sidebar to stay collapsed (icons only, no text labels).
       IG expands on hover via width transition — block it. */
    nav[role="navigation"],
    nav[role="navigation"] > div {
      width: 72px !important; min-width: 72px !important; max-width: 72px !important;
      overflow: hidden !important; transition: none !important;
    }

    /* Hide "Also from Meta" / Threads cross-promo */
    a[href*="threads.net"], a[href*="meta.com"] { display: none !important; }

    /* Floating debug indicator */
    #__if_indicator {
      position: fixed; bottom: 12px; right: 12px; z-index: 99999;
      background: rgba(20,20,20,0.85); color: #6f6; font: 11px/1.2 monospace;
      padding: 4px 8px; border-radius: 4px; pointer-events: none;
    }
  `;

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById && document.getElementById('__if_style')) return;
    const target = document.head || document.documentElement;
    if (!target) {
      setTimeout(injectStyles, 5);
      return;
    }
    const s = document.createElement('style');
    s.id = '__if_style';
    s.textContent = CSS;
    target.appendChild(s);
    log('CSS injected');
    if (!window.__if_obs && document.documentElement) {
      window.__if_obs = new MutationObserver(injectStyles);
      window.__if_obs.observe(document.documentElement, { childList: true });
    }
  }
  injectStyles();

  // =========================================================
  // 3. SIDEBAR HIDING — highda's proven approach
  // For each unwanted nav link, climb up to a stable container and hide.
  // =========================================================
  const HIDE_HREFS = [
    '/',           // Home (we'll filter to only the sidebar Home, not /direct/inbox/)
    '/explore/',
    '/reels/'
  ];

  // Aria-label-based items (no stable href)
  const HIDE_ARIA_LABELS = [
    'Search',
    'Notifications',
    'New post',
    'Create',
    'Threads',
    'AI Studio',
    'Meta AI'
  ];

  function hideContainer(el, label) {
    // Only climb to the nearest link/button wrapper — never higher.
    // Climbing too far swallows the thread list panel.
    let container;
    if (el.tagName === 'A') {
      container = el;
    } else {
      container = el.closest('a') || el.closest('[role="button"]') || el.closest('[role="link"]');
      if (!container) container = el.parentElement;
    }
    // Safety: skip if this container holds thread links (thread list panel)
    if (container && container.querySelector('a[href^="/direct/t/"]')) return false;
    if (container && !container.classList.contains('__if_hide')) {
      container.classList.add('__if_hide');
      log('Hidden sidebar item:', label);
      return true;
    }
    return false;
  }

  function hideSidebarItems() {
    let count = 0;
    // Hrefs
    for (const href of HIDE_HREFS) {
      const links = document.querySelectorAll(`a[href="${href}"]`);
      for (const link of links) {
        // For "/" (home), only hide if it's NOT the Direct/inbox link
        if (href === '/' && link.getAttribute('aria-label') === 'Home' === false) {
          // Actually: skip this filter. "/" links in sidebar are Home.
          // The /direct/inbox/ link is href="/direct/" — different.
        }
        if (hideContainer(link, `href=${href}`)) count++;
      }
    }
    // Aria-labels (find SVG with that label and climb)
    for (const lbl of HIDE_ARIA_LABELS) {
      const svgs = document.querySelectorAll(`svg[aria-label="${lbl}"]`);
      for (const svg of svgs) {
        if (hideContainer(svg, `aria-label=${lbl}`)) count++;
      }
    }
    // Stories tray + Notes tray inside DM inbox (top of /direct/inbox/)
    const storyTrays = document.querySelectorAll('section[role="main"] [aria-label*="Stories" i], section[role="main"] [aria-label*="Notes" i]');
    for (const t of storyTrays) {
      if (!t.classList.contains('__if_hide')) {
        t.classList.add('__if_hide');
        count++;
        log('Hidden stories/notes tray');
      }
    }
    if (count) log('Hid', count, 'items this scan');
  }

  // =========================================================
  // 4. THREAD-LIST CONDITIONAL PREVIEW
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
      if (unread) el.classList.remove('__if_hide_preview');
      else el.classList.add('__if_hide_preview');
    }
  }

  function scanThreadList() {
    const rows = document.querySelectorAll('a[href^="/direct/t/"], div[role="listitem"]');
    rows.forEach(processThreadRow);
  }

  // =========================================================
  // 5. REEL — FORCE CLOSE ON SCROLL
  // =========================================================
  let reelAttached = false;

  function isOnReel() {
    if (/^\/reels?\//.test(location.pathname)) return true;
    // Detect IG reel viewer dialog
    const v = document.querySelector('section main article video, [role="dialog"] video');
    if (v && v.videoHeight > 0 && v.videoHeight > v.videoWidth) return true;
    return false;
  }

  function closeReel() {
    log('Closing reel');
    const closeBtn = document.querySelector('svg[aria-label="Close"]')?.closest('div[role="button"], button, a');
    if (closeBtn) { closeBtn.click(); return; }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setTimeout(() => {
      if (isOnReel()) {
        if (history.length > 1) history.back();
        else location.replace('https://www.instagram.com/direct/inbox/');
      }
    }, 300);
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
  // 6. AUTO-MARK-READ
  // =========================================================
  const NOTIF_INTERVAL = 5 * 60 * 1000;
  const MARK_DELAY = 30 * 60 * 1000;
  let lastNotif = 0;
  const SEEN_KEY = '__if_seen';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function markNotificationsRead() {
    if (!TEST_MODE && !document.hidden) return;
    if (Date.now() - lastNotif < NOTIF_INTERVAL) return;
    lastNotif = Date.now();
    log('Attempting notif panel open (marks read by side-effect)');
    const heart = document.querySelector('svg[aria-label="Notifications"]');
    const btn = heart?.closest('a, [role="button"], button, [role="link"]');
    if (!btn) { log('No notif heart found'); return; }
    btn.click();
    await sleep(1500);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (/^\/notifications/.test(location.pathname) || /^\/explore/.test(location.pathname)) {
      history.back();
    }
  }

  async function tryApiMarkRead() {
    const csrf = getCookie('csrftoken');
    if (!csrf) return false;
    try {
      const res = await fetch('/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&persistentBadging=true', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-csrftoken': csrf,
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest'
        }
      });
      if (!res.ok) { log('API inbox fetch failed:', res.status); return false; }
      const data = await res.json();
      const threads = data?.inbox?.threads || [];
      log('API inbox returned', threads.length, 'threads');
      const seen = loadSeen();
      const now = Date.now();
      for (const t of threads) {
        if (!t.read_state) continue;
        const id = t.thread_id;
        const item = t.items?.[0];
        if (!item) continue;
        if (!seen[id]) seen[id] = now;
        if (now - seen[id] >= MARK_DELAY) {
          log('API mark-read thread', id);
          await fetch(`/api/v1/direct_v2/threads/${id}/items/${item.item_id}/seen/`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'x-csrftoken': csrf,
              'x-ig-app-id': '936619743392459',
              'x-requested-with': 'XMLHttpRequest'
            },
            body: 'use_unified_inbox=true'
          }).catch(e => log('mark-read POST failed', e));
          delete seen[id];
        }
      }
      for (const k of Object.keys(seen)) {
        if (now - seen[k] > 7 * 24 * 60 * 60 * 1000) delete seen[k];
      }
      saveSeen(seen);
      return true;
    } catch (e) {
      log('API mark-read errored:', e);
      return false;
    }
  }

  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
  function saveSeen(s) { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); }

  // =========================================================
  // 7. DEBUG INDICATOR
  // =========================================================
  function showIndicator() {
    if (document.getElementById('__if_indicator')) return;
    if (!document.body) return;
    const i = document.createElement('div');
    i.id = '__if_indicator';
    i.textContent = 'IG Focus v2 ✓';
    document.body.appendChild(i);
    log('Indicator shown');
  }

  // =========================================================
  // 8. RUN LOOP
  // =========================================================
  function tick() {
    showIndicator();
    hideSidebarItems();
    scanThreadList();
    checkReel();
    markNotificationsRead();
    tryApiMarkRead();
  }

  function start() {
    log('start() running');
    showIndicator();
    let count = 0;
    const fast = setInterval(() => {
      hideSidebarItems();
      scanThreadList();
      checkReel();
      if (++count >= 10) clearInterval(fast);
    }, 1000);
    setInterval(tick, 60 * 1000);
    // Debounced MutationObserver via rAF
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
    if (window.__if_started) return;
    if (!document.body) {
      requestAnimationFrame(startWhenReady);
      return;
    }
    window.__if_started = true;
    start();
  }
  startWhenReady();
})();
