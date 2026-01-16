from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        print("Navigating to file:///app/beta.html")
        page.goto("file:///app/beta.html")
        time.sleep(2)
        
        # Force Bypass Login Screen for UI Verification
        print("Bypassing login overlay...")
        page.evaluate("""
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
        """)
        
        # Click Availability Tab
        print("Clicking Availability Tab...")
        page.click('#tab-availability-input')
        time.sleep(1)
        
        # Screenshot
        page.screenshot(path="verification/beta_availability_ui.png")
        print("Screenshot saved to verification/beta_availability_ui.png")
        
        browser.close()

if __name__ == "__main__":
    run()
