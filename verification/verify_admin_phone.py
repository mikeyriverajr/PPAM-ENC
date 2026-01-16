
from playwright.sync_api import sync_playwright, expect

def test_admin_phone_extraction(page):
    # Mock the CSV response
    # Case: Phone in G1 (Index 6)
    mock_csv = (
        '"Predicación Pública en Áreas Metropolitanas",,,,"Num. del Programador del Mes",,"595983281197"\n'
        '"Fecha","Ubicación","8 a 10","10 a 12","18:30 a 20:30","Encargado del día"\n'
        '"sábado 10 enero","Costanera","User1","User2","User3","Manager1"'
    )

    # Intercept requests to Google Sheets
    page.route("**/*gviz/tq*", lambda route: route.fulfill(
        status=200,
        content_type="text/plain",
        body=mock_csv
    ))

    # Go to the page
    page.goto("http://localhost:8080/index.html")
    
    # Wait for schedule to load
    # It checks for .day class
    page.wait_for_selector(".day", timeout=5000)
    
    # Handle the prompt for Admin Panel
    page.on("dialog", lambda dialog: dialog.accept("ppam2026"))
    
    # Click the lock button
    page.click("#admin-lock-btn")
    
    # Wait for Admin Panel to appear
    expect(page.locator("#admin-panel")).to_be_visible()
    
    # Check for the phone number text
    # It should say "Número Admin Actual: 595983281197"
    content = page.locator("#admin-info-display").inner_text()
    print("Admin Info Content:", content)
    
    if "595983281197" not in content:
        raise Exception(f"Phone number not found in admin panel. Got: {content}")
    
    # Take screenshot
    page.screenshot(path="verification/admin_panel_verified.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_admin_phone_extraction(page)
            print("Verification Successful!")
        except Exception as e:
            print(f"Verification Failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
