"""
Test fb-focus and ig-focus userscripts in a headless browser.
Captures console logs, errors, redirects, and takes screenshots.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).parent

def strip_userscript_header(src: str) -> str:
    """Remove the // ==UserScript== ... // ==/UserScript== block; Playwright doesn't need it."""
    lines = src.splitlines()
    out = []
    in_header = False
    for line in lines:
        if line.startswith("// ==UserScript=="):
            in_header = True
            continue
        if line.startswith("// ==/UserScript=="):
            in_header = False
            continue
        if not in_header:
            out.append(line)
    return "\n".join(out)


def test_site(name: str, url: str, script_path: Path, expect_redirect_substr: str | None):
    print(f"\n{'='*60}\nTesting {name} -> {url}\n{'='*60}")
    src = strip_userscript_header(script_path.read_text(encoding="utf-8"))
    console_logs = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        # Inject userscript on every navigation, before any other script runs.
        # This mimics Tampermonkey @run-at document-start.
        context.add_init_script(src)
        page = context.new_page()

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
        except Exception as e:
            print(f"  Initial goto error (may be expected if redirect fires): {e}")

        # Wait for any redirects + script execution
        page.wait_for_timeout(5000)

        final_url = page.url
        print(f"  Final URL: {final_url}")
        if expect_redirect_substr:
            ok = expect_redirect_substr in final_url
            print(f"  Expected URL substring '{expect_redirect_substr}': {'PASS' if ok else 'FAIL'}")

        # Check for the floating indicator
        try:
            ind = page.locator("#__ff_indicator, #__if_indicator").count()
            print(f"  Floating indicator present: {'YES' if ind > 0 else 'NO'} ({ind} elements)")
        except Exception as e:
            print(f"  Indicator check errored: {e}")

        # Check for the injected style tag
        try:
            style_count = page.locator("#__ff_style, #__if_style").count()
            print(f"  Injected style tag present: {'YES' if style_count > 0 else 'NO'}")
        except Exception as e:
            print(f"  Style check errored: {e}")

        # Screenshot
        shot_path = REPO / f"test_{name.lower()}.png"
        page.screenshot(path=str(shot_path), full_page=False)
        print(f"  Screenshot: {shot_path.name}")

        # Print our script's console logs (filter to TAG)
        focus_logs = [l for l in console_logs if "[FB-FOCUS]" in l or "[IG-FOCUS]" in l]
        print(f"  Focus-script console logs ({len(focus_logs)}):")
        for l in focus_logs[:30]:
            print(f"    {l}")

        if errors:
            print(f"  PAGE ERRORS ({len(errors)}):")
            for e in errors[:10]:
                print(f"    {e}")
        else:
            print("  PAGE ERRORS: none")

        browser.close()
    return len(focus_logs), len(errors)


def main():
    fb_logs, fb_errs = test_site(
        "FB", "https://www.facebook.com/", REPO / "fb-focus.user.js",
        expect_redirect_substr="/messages"
    )
    ig_logs, ig_errs = test_site(
        "IG", "https://www.instagram.com/", REPO / "ig-focus.user.js",
        expect_redirect_substr="/direct/inbox/"
    )

    print(f"\n{'='*60}\nSUMMARY\n{'='*60}")
    print(f"  FB: {fb_logs} script logs, {fb_errs} page errors")
    print(f"  IG: {ig_logs} script logs, {ig_errs} page errors")

    if fb_errs > 0 or ig_errs > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
