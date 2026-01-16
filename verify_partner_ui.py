from playwright.sync_api import sync_playwright
import os

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Block Real Firebase CDN
        page.route("**/firebasejs/**", lambda route: route.abort())
        page.route("**/gstatic.com/**", lambda route: route.abort())

        # Subscribe to logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))

        # Inject Mock Firebase BEFORE page loads
        page.add_init_script("""
            const mockUser = { uid: 'test-user', email: 'test@example.com' };
            const mockDocs = (data) => ({
                docs: data.map(d => ({
                    id: d.id || 'id',
                    data: () => d
                })),
                empty: data.length === 0,
                forEach: (cb) => data.forEach(d => cb({ id: d.id, data: () => d }))
            });
            const mockDoc = (data) => ({
                exists: !!data,
                data: () => data
            });

            window.firebase = {
                initializeApp: () => console.log("Firebase Initialized (Mock)"),
                auth: () => ({
                    onAuthStateChanged: (cb) => {
                        console.log("Auth Listener Registered. Triggering mock user.");
                        cb(mockUser); // Trigger immediately
                        return () => {};
                    },
                    signInWithEmailAndPassword: async () => {}
                }),
                firestore: () => {
                     const db = {
                        collection: (name) => {
                            if (name === 'locations') {
                                return {
                                    orderBy: () => ({
                                        get: async () => mockDocs([
                                            { name: 'Costanera', weeklySchedule: { 'Lunes': ['08:00-10:00'] } }
                                        ])
                                    }),
                                    get: async () => mockDocs([])
                                };
                            }
                            if (name === 'users') {
                                return {
                                    get: async () => mockDocs([
                                        { id: 'u1', linkedName: 'Alice' },
                                        { id: 'u2', linkedName: 'Bob' },
                                        { id: 'test-user', linkedName: 'Me' }
                                    ]),
                                    doc: (id) => ({
                                        get: async () => mockDoc({
                                            weeklyAvailability: { "Costanera|Lunes|08:00-10:00": true },
                                            preferredPartner: 'Bob',
                                            strictPartnerLock: true,
                                            linkedName: 'Me'
                                        }),
                                        collection: () => ({
                                            where: () => ({
                                                orderBy: () => ({
                                                    onSnapshot: () => {}
                                                })
                                            })
                                        })
                                    })
                                };
                            }
                            if (name === 'days' || name === 'shifts') {
                                return {
                                    orderBy: () => ({ onSnapshot: () => {} }),
                                    onSnapshot: () => {}
                                };
                            }
                            return { get: async () => mockDocs([]) };
                        },
                        batch: () => ({ commit: async () => {} })
                     };
                     db.FieldValue = { serverTimestamp: () => 'TIMESTAMP' };
                     return db;
                }
            };
        """)

        cwd = os.getcwd()
        page.goto(f"file://{cwd}/beta.html")

        # Wait
        page.wait_for_timeout(2000)

        # Force switch tab
        page.evaluate("""() => {
             if (typeof switchTab === 'function') {
                console.log("Calling switchTab...");
                switchTab('availability-input');
             }
        }""")

        page.wait_for_timeout(2000)

        element = page.locator("#availability-container")
        if element.is_visible():
            element.screenshot(path="verification_partner_ui.png")
            print("Screenshot taken: verification_partner_ui.png")
        else:
            print("Container not visible")
            page.screenshot(path="debug_console_v5.png")

        browser.close()

if __name__ == "__main__":
    verify_ui()
