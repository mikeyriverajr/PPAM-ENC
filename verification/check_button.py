
from playwright.sync_api import sync_playwright, expect

def test_admin_panel_phone(page):
    # Go to the local page
    page.goto("http://localhost:8080/index.html")
    
    # Wait for schedule to load or error message
    # Since we can't fully control the fetch in this env if there is no internet, 
    # we might see an error. But let's see. 
    # Even with error, the parsing logic *runs* if there is any text. 
    # If fetch fails, we can't test the parsing of G1.
    
    # However, I can inject a mock response if needed.
    # But let's try real first.
    
    try:
        page.wait_for_selector("#schedule-container .day, #schedule-container h3", timeout=10000)
    except:
        print("Timed out waiting for schedule. Checking for error message...")
        content = page.content()
        if "Error al cargar los datos" in content:
            print("Fetch failed. Proceeding to mock fetch...")
            # We need to mock the fetch response to test the parsing logic.
            mock_csv = '''"Predicación Pública en Áreas Metropolitanas",,,,"Num. del Programador del Mes",,"595983281197"
"Fecha","Ubicación","8 a 10","10 a 12","18:30 a 20:30","Encargado del día"
"sábado 10 enero","Costanera","User1","User2","User3","Manager1"'''
            
            page.route("**/*gviz/tq*", lambda route: route.fulfill(
                status=200,
                body=mock_csv
            ))
            page.reload()
            page.wait_for_selector("#schedule-container .day", timeout=5000)
    
    # Click Admin Lock Button
    # It might be hidden or small. It's #admin-lock-btn
    # Wait, the lock button is in the header? 
    # No, looking at css/js, it was added in v11?
    # I didn't see the code adding #admin-lock-btn in app.v13.js provided in previous turn?
    
    # Wait, I might have missed copying the part of app.v12.js that adds the button?
    # Let me check app.v13.js content I wrote.
    # I wrote: "function toggleAdminPanel() { ... }"
    # But where is the button added to the DOM?
    # In app.v12.js, I don't see code that *creates* the button. 
    # It seems the button is expected to be in HTML? Or created by JS?
    
    # Let's check index.html again.
    pass

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Check if button exists in HTML
             page.goto("http://localhost:8080/index.html")
             # Just take a screenshot to see what we have
             page.screenshot(path="verification/initial.png")
        finally:
            browser.close()
