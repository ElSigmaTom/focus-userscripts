# focus-userscripts

Tampermonkey scripts that strip Facebook and Instagram down to messaging-only — for when the only legitimate reason to open them is to talk to one specific person.

## What they do

### `fb-focus.user.js`

- Redirects `facebook.com`, `/home`, `/marketplace`, `/reels/`, `/watch`, etc. → `facebook.com/messages`.
- Hides the entire left rail and top-bar nav (Home, Reels, Marketplace, Watch, Groups, Gaming, Notifications, Friends).
- Hides right-side suggestion / Marketplace / sponsored panels on `/messages`.
- Keeps the profile menu (avatar top-right) so you can still log out / get to settings.
- **Reel scroll-close**: any wheel scroll, touch swipe, or PageDown/Space on a reel viewer immediately closes it. You can watch a reel a friend sent you, but you can't scroll into the next one.
- **Conditional thread previews**: in the conversation list, *read* threads show only avatar + name + timestamp (no preview text — no rabbit holes). *Unread* threads show the actual message content with the name in bold (no "1 New Message" mystery box).
- **Auto-mark-read** (background, only when tab is hidden):
  - Notifications: every 5 min, programmatically opens the bell + clicks "Mark all as read".
  - Messages: 30 min after a thread becomes unread, opens it (which marks it read server-side and clears your phone badge). 30-min delay preserves the unread-preview behavior while you're actually using the page.

### `ig-focus.user.js`

- Redirects `instagram.com`, `/explore/`, `/reels/`, `/stories/` → `instagram.com/direct/inbox/`.
- Allows `/<username>/` (profile pages, since DMs link to them) and `/reel/<id>/` (singular — used when GF shares one reel via DM).
- Hides Home, Search, Explore, Reels, Notifications, Create, Threads, Meta AI from the left rail.
- Keeps Direct + Profile + More (so logout works).
- Hides Stories tray inside the inbox.
- **Reel scroll-close**: same as FB.
- **Conditional thread previews**: same as FB.
- **Auto-mark-read**:
  - DMs: tries IG's private API (`/api/v1/direct_v2/threads/<id>/items/<item_id>/seen/`) with the page's csrf token. 30-min delay per thread. Falls back to clicking the row if the API errors.
  - Notifications: 5-min interval, opens the activity panel (which marks them seen) then closes.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser (Chrome / Edge / Firefox).
2. Click these raw URLs — Tampermonkey will prompt to install:
   - **FB**: https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/fb-focus.user.js
   - **IG**: https://raw.githubusercontent.com/ElSigmaTom/focus-userscripts/main/ig-focus.user.js
3. Reload `facebook.com` and `instagram.com`. Done.

The scripts auto-update whenever this repo is pushed (Tampermonkey checks daily by default; you can force-check via dashboard → "Check for userscript updates").

## Caveats

### Auto-mark-read is best-effort

Facebook's GraphQL `doc_id`s for "mark all read" rotate, so this script uses a **click-fallback** instead of direct API calls — it programmatically clicks the bell + "Mark all as read" button when the tab is hidden (so it's not visually disruptive). If FB renames those buttons or restructures the menu, the click-fallback will silently no-op until the script is updated.

Instagram's API path is more stable so the IG script does direct API calls when possible, with a click-fallback if that errors.

If you notice phone badges aren't clearing within ~30 min of a message arriving, the click-fallback path probably broke. Open DevTools console on the FB/IG tab and look for warnings prefixed `[ig-focus]` or for silent failures.

### Read receipts get sent

When the script auto-marks a message thread as read, your friend sees "Seen" in chat (or whatever the platform's read receipt shows). The 30-min delay means it's not instant, but it does happen. If that's a problem, change `MARK_DELAY_MS` in the script to a much larger value (e.g. 24 hours) or remove the message-mark-read block entirely.

### Selectors will break occasionally

FB and IG rotate their CSS class names constantly. The scripts use `aria-label` attributes wherever possible (those are more stable for accessibility reasons), but text-based selectors and DOM heuristics will break sometimes. When that happens:

1. Open DevTools → Inspect the element that should be hidden.
2. Find a stable attribute (preferably `aria-label`, `role`, or `data-*`).
3. Add it to the relevant CSS block in the script.
4. Bump the version number, push to this repo, Tampermonkey auto-updates.

## v2 ideas

- Direct GraphQL calls for FB mark-read (capture exact `doc_id` once, hardcode with regex fallback).
- Hide story-share replies in DMs.
- Block DM voice/video call buttons (less distracting interface).
- Add a hidden "/?focus=off" escape hatch query param if the no-escape-hatch policy ever softens.

## License

MIT — do whatever.
