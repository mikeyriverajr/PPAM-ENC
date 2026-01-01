// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

// Initialize Main App (for Admin Auth)
const mainApp = firebase.initializeApp(firebaseConfig);
const mainAuth = mainApp.auth();
const db = mainApp.firestore();

// Initialize Secondary App (for User Creation without logout)
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// Auth Listener
mainAuth.onAuthStateChanged(user => {
    if (user) {
        // Check Role
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists && doc.data().role === 'admin') {
                showDashboard();
                loadDashboardData();
            } else {
                alert("No tienes permisos de administrador.");
                mainAuth.signOut();
            }
        }).catch(err => {
            console.error(err);
            alert("Error verificando permisos.");
        });
    } else {
        showLogin();
    }
});

function showLogin() {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
}

function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

function loadDashboardData() {
    // 1. Load Existing Users to Table
    db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        const tbody = document.getElementById('users-table-body');
        let html = "";
        const linkedNames = new Set();

        snap.forEach(doc => {
            const data = doc.data();
            const uid = doc.id;
            if (data.linkedName) linkedNames.add(data.linkedName);

            html += `<tr>
                <td style="padding:8px;">${data.username}</td>
                <td style="padding:8px;">${data.linkedName || "-"}</td>
                <td style="padding:8px;">${data.role}</td>
                <td style="padding:8px;">
                    <button onclick="deleteUser('${uid}')" style="background:#d9534f; padding:5px; font-size:0.8em; width:auto;">Borrar</button>
                </td>
            </tr>`;
        });

        if (html === "") html = '<tr><td colspan="4" style="text-align:center; padding:10px;">No hay usuarios.</td></tr>';
        tbody.innerHTML = html;

        // 2. Load Unassigned Participants to Dropdown
        loadUnassignedParticipants(linkedNames);
    });
}

function loadUnassignedParticipants(linkedNamesSet) {
    const select = document.getElementById('new-displayname-select');

    db.collection('participants').orderBy('name').get().then(snap => {
        let html = '<option value="">-- Selecciona un nombre --</option>';
        let count = 0;

        snap.forEach(doc => {
            const name = doc.id;
            if (!linkedNamesSet.has(name)) {
                html += `<option value="${name}">${name}</option>`;
                count++;
            }
        });

        if (count === 0) {
            html = '<option value="">Todos los nombres tienen cuenta</option>';
        }
        select.innerHTML = html;
    });
}

function deleteUser(uid) {
    if (!confirm("¿Seguro que deseas eliminar este usuario? (La autenticación debe borrarse manualmente en Firebase Console por seguridad, esto solo borra el perfil)")) return;

    // Note: Deleting auth user from client SDK is restricted.
    // We can only delete the Firestore doc here. Admin must clean up Auth console.
    db.collection('users').doc(uid).delete().then(() => {
        alert("Perfil de usuario eliminado. Recuerda borrar también el usuario en 'Authentication' del panel de Firebase.");
    }).catch(err => alert("Error: " + err.message));
}

function adminLogin() {
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value;

    let email = user;
    if (!user.includes('@')) {
        email = user + "@ppam.placeholder.com";
    }

    mainAuth.signInWithEmailAndPassword(email, pass)
        .catch(error => {
            document.getElementById('login-error').innerText = error.message;
        });
}

function logout() {
    mainAuth.signOut();
}

function createUser() {
    const username = document.getElementById('new-username').value.trim();
    const pass = document.getElementById('new-password').value;
    const name = document.getElementById('new-displayname-select').value; // Changed to SELECT
    const role = document.getElementById('new-role').value;

    const msg = document.getElementById('create-msg');
    const err = document.getElementById('create-error');

    msg.innerText = "";
    err.innerText = "";

    if (!username || !pass || !name) {
        err.innerText = "Completa todos los campos.";
        return;
    }

    const email = username.includes('@') ? username : username + "@ppam.placeholder.com";

    secondaryAuth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            const uid = userCredential.user.uid;

            // Create User Profile
            const userRef = db.collection('users').doc(uid);
            const userPromise = userRef.set({
                username: username,
                linkedName: name,
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Ensure Participant Exists
            const partRef = db.collection('participants').doc(name);
            const partPromise = partRef.set({ name: name }, { merge: true });

            return Promise.all([userPromise, partPromise]);
        })
        .then(() => {
            msg.innerText = `Usuario '${username}' creado exitosamente.`;
            // Clear inputs
            document.getElementById('new-username').value = "";
            document.getElementById('new-password').value = "";
            document.getElementById('new-displayname-select').value = "";

            // Sign out the secondary auth so it doesn't interfere (optional but good practice)
            secondaryAuth.signOut();
        })
        .catch((error) => {
            console.error("Error creating user:", error);
            err.innerText = "Error: " + error.message;
        });
}
