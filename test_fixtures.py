"""
Test userscripts against local HTML fixtures (mocked FB/IG DOM structure).
Doesn't require login. Verifies selectors actually hit the elements they should.
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).parent

def strip_header(src):
    out, in_h = [], False
    for line in src.splitlines():
        if line.startswith("// ==UserScript=="): in_h = True; continue
        if line.startswith("// ==/UserScript=="): in_h = False; continue
        if not in_h: out.append(line)
    return "\n".join(out)

def patch_redirect(src, fixture_url):
    # Skip the location.replace call (we're testing on local file://)
    return src.replace("location.replace('https://www.facebook.com/messages')",
                       "console.log('[FB-FOCUS] (test) skipping redirect')") \
              .replace("location.replace('https://www.instagram.com/direct/inbox/')",
                       "console.log('[IG-FOCUS] (test) skipping redirect')")

def run(name, fixture, script_path, expected_hides):
    print(f"\n{'='*60}\n{name}: {fixture.name}\n{'='*60}")
    src = patch_redirect(strip_header(script_path.read_text(encoding="utf-8")), fixture)
    logs, errs = [], []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        ctx.add_init_script(src)
        page = ctx.new_page()
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: errs.append(str(e)))

        page.goto(f"file:///{fixture.as_posix()}")
        page.wait_for_timeout(2500)

        results = {}
        for label, selector in expected_hides.items():
            # Check if any matching element is hidden (display:none via class or computed style)
            count = page.locator(selector).count()
            hidden = 0
            for i in range(count):
                el = page.locator(selector).nth(i)
                try:
                    is_visible = el.is_visible()
                    if not is_visible:
                        hidden += 1
                except: pass
            results[label] = (hidden, count)

        # Indicator check
        ind_count = page.locator("#__ff_indicator, #__if_indicator").count()
        style_count = page.locator("#__ff_style, #__if_style").count()

        print(f"  Indicator element: {ind_count}")
        print(f"  Style element: {style_count}")
        print(f"  Hide checks:")
        all_pass = True
        for label, (hidden, total) in results.items():
            status = "PASS" if hidden == total and total > 0 else "FAIL"
            if status == "FAIL": all_pass = False
            print(f"    {status} {label}: {hidden}/{total} hidden")

        focus_logs = [l for l in logs if "[FB-FOCUS]" in l or "[IG-FOCUS]" in l]
        print(f"  Console logs ({len(focus_logs)}):")
        for l in focus_logs[:20]: print(f"    {l}")

        if errs:
            print(f"  ERRORS ({len(errs)}):")
            for e in errs: print(f"    {e}")

        page.screenshot(path=str(REPO / f"fixture_{name.lower()}.png"))
        browser.close()
    return all_pass and not errs

def main():
    fb_ok = run(
        "FB", REPO / "fixtures" / "fb-fixture.html", REPO / "fb-focus.user.js",
        {
            "Top-bar tablist": '[role="tablist"]',
            "aria-label Marketplace link": '[aria-label="Marketplace"][role="link"]',
            "aria-label Watch link": '[aria-label="Watch"][role="link"]',
            "aria-label Notifications": '[aria-label="Notifications"]',
            "aria-label Friend requests": '[aria-label="Friend requests"]',
            "Unread badge": '[aria-label*="unread" i]',
            "Sponsored panel": '[role="complementary"] [aria-label*="Sponsored" i]',
            "Reels-section by class": '.x1lliihq',
        }
    )
    ig_ok = run(
        "IG", REPO / "fixtures" / "ig-fixture.html", REPO / "ig-focus.user.js",
        {
            "Explore link": 'a[href="/explore/"]',
            "Reels link": 'a[href="/reels/"]',
            "Search SVG": 'svg[aria-label="Search"]',
            "Notifications SVG": 'svg[aria-label="Notifications"]',
            "Threads SVG": 'svg[aria-label="Threads"]',
            "Unread badge": '[aria-label*="unread" i]',
        }
    )

    print(f"\n{'='*60}\nRESULT: FB={'OK' if fb_ok else 'FAIL'}  IG={'OK' if ig_ok else 'FAIL'}")
    sys.exit(0 if (fb_ok and ig_ok) else 1)

if __name__ == "__main__":
    main()
