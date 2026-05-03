# focus-userscripts

Tampermonkey scripts that strip Facebook and Instagram down to messaging-only — for when the only legitimate reason to open them is to talk to one specific person.

Built on top of proven cleaner scripts:
- IG: [highda/instagram-distraction-free-js](https://github.com/highda/instagram-distraction-free-js) sidebar-hide pattern
- FB: [Hide Facebook Reels Completely](https://greasyfork.org/en/scripts/452724) text-content matching pattern

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Click these raw URLs — Tampermonkey will prompt to install:
   - **FB**: https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
   - **IG**: https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
3. Reload `facebook.com` and `instagram.com`.

## How to verify it's working

Both scripts now show a **floating green "FB Focus v2 ✓" / "IG Focus v2 ✓" badge** in the bottom-right corner of every page they're active on. If you don't see it, the script isn't loading — check:

1. Tampermonkey dashboard → script is **enabled** (not just installed)
2. The script's match pattern includes the URL you're on
3. Open DevTools (F12) → Console tab — search for `[FB-FOCUS]` or `[IG-FOCUS]` — you should see a "v2.0.0 loaded" log line plus periodic activity

## What each does

### FB
- Redirects `/`, `/home`, `/marketplace`, `/reels/`, `/watch`, `/groups/feed`, etc. → `/messages`.
- Hides Home / Reels / Marketplace / Watch / Groups / Gaming / Memories / Saved / Friends / Notifications / Friend requests / Stories nav items by:
  - `aria-label` direct match (CSS)
  - Text-content matching (JS) — finds spans containing the words above and climbs up to the link/listitem container to hide
- Hides red unread/notification badges via `aria-label*="unread"` etc.
- Hides right-rail Sponsored / Marketplace / Reels / "People you may know" panels.
- Reels viewer: any wheel/swipe/PageDown/Space/Arrow → closes the reel.
- Thread previews:
  - Read threads → only avatar/name/timestamp visible.
  - Unread threads → full preview text + bold name.
- Auto-mark-read (only when tab hidden, so it doesn't disrupt active use):
  - Notifications: every 5 min, programmatically clicks bell + "Mark all as read".
  - Messages: 30 min after a thread becomes unread, opens it (sends read receipt — accepted tradeoff).

### IG
- Redirects `/`, `/explore/`, `/reels/`, `/stories/` → `/direct/inbox/`.
- Allows `/<username>/`, `/p/<id>/`, `/reel/<id>/` (singular DM share), `/accounts/*` (logout).
- Hides Home / Search / Explore / Reels / Notifications / New post / Threads / AI Studio nav items.
- Hides Stories tray + Notes tray inside DM inbox.
- Reels viewer: same scroll-close behavior as FB.
- Thread previews: same conditional behavior as FB.
- Auto-mark-read DMs via direct API call to `/api/v1/direct_v2/threads/<id>/items/<id>/seen/` with 30-min delay. Falls back to clicking notif heart icon.

## Caveats

### Selectors break

FB/IG rotate class names constantly. If selectors fall out of date:

1. Open DevTools → Console → look for `[FB-FOCUS]` / `[IG-FOCUS]` logs — they'll tell you what's being hidden and what's failing.
2. Inspect the element that should be hidden but isn't. Look for `aria-label`, `href`, or stable text content.
3. Add it to:
   - `HIDE_NAV_TEXTS` array (FB) for text matching, or `aria-label` selectors in `CSS`
   - `HIDE_HREFS` / `HIDE_ARIA_LABELS` arrays (IG)
4. Bump version + push to GitHub. Tampermonkey checks daily for updates (force via dashboard).

### Read receipts get sent (delayed 30 min)

When the script auto-marks a message thread, your friend sees "Seen" on chat after the 30-min delay. To disable: change `MARK_DELAY = 30 * 60 * 1000` to a huge number, or comment out `markMessagesRead()` / `tryApiMarkRead()` in the run loop.

### v1 → v2 changes

v1 didn't work — selectors were too narrow and there was no diagnostic logging. v2:
- Combines text-content matching with aria-label selectors (more resilient)
- Floating green badge on every page so you see if it loaded
- Heavy console.log so you can debug
- 1-second fast-scan during the first 10s after page load (FB/IG hydrate async)
- Steady 60s tick after that
- MutationObserver on `body` to catch SPA route changes

## License

MIT.
