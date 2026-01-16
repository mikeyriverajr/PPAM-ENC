from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))
        
        print("Navigating to file:///app/admin.html")
        page.goto("file:///app/admin.html")
        
        # Check login section visibility
        if page.is_visible("#login-section"):
            print("Login section visible.")
        else:
            print("Login section NOT visible.")
            
        browser.close()

if __name__ == "__main__":
    run()
