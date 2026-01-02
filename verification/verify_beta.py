from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        print("Navigating to file:///app/beta.html")
        page.goto("file:///app/beta.html")

        # Wait a bit for JS to init
        time.sleep(3)

        # Check if overlay is visible
        overlay = page.locator("#login-overlay")
        is_visible = overlay.is_visible()
        print(f"Overlay visible: {is_visible}")

        # Screenshot
        page.screenshot(path="verification/beta_screenshot.png")
        print("Screenshot saved to verification/beta_screenshot.png")

        browser.close()

if __name__ == "__main__":
    run()
