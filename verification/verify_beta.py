
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local beta.html file
        # Since I'm in the root of the repo, I can use absolute path
        cwd = os.getcwd()
        file_url = f'file://{cwd}/beta.html'
        print(f'Navigating to {file_url}')

        page.goto(file_url)

        # Wait a bit for JS to load (though Firebase init might fail)
        page.wait_for_timeout(2000)

        # Take a screenshot
        screenshot_path = 'verification/beta_screenshot.png'
        page.screenshot(path=screenshot_path)
        print(f'Screenshot saved to {screenshot_path}')

        browser.close()

if __name__ == '__main__':
    run()
