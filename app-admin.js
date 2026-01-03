// Initialize Main App (for Admin Auth)
// Note: firebaseConfig is loaded from firebase-config.js
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

let allUsers = []; // Store for client-side filtering

function loadDashboardData() {
    // 1. Load Existing Users to Table
    db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        allUsers = [];
        const linkedNames = new Set();

        snap.forEach(doc => {
            const data = doc.data();
            data.uid = doc.id;
            allUsers.push(data);
            if (data.linkedName) linkedNames.add(data.linkedName);
        });

        renderUsersTable(allUsers);

        // 2. Load Unassigned Participants to Dropdown
        loadUnassignedParticipants(linkedNames);
    });
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    let html = "";

    users.forEach(user => {
        html += `<tr>
            <td style="padding:8px;">${user.username}</td>
            <td style="padding:8px;">${user.linkedName || "-"}</td>
            <td style="padding:8px;">${user.role}</td>
            <td style="padding:8px;">
                <button onclick="openEditModal('${user.uid}', '${user.username}', '${user.role}')" class="btn-warning" style="padding:5px; font-size:0.8em; width:auto; margin-right:5px;">Editar</button>
                <button onclick="deleteUser('${user.uid}')" style="background:#d9534f; padding:5px; font-size:0.8em; width:auto;">Borrar</button>
            </td>
        </tr>`;
    });

    if (html === "") html = '<tr><td colspan="4" style="text-align:center; padding:10px;">No hay usuarios.</td></tr>';
    tbody.innerHTML = html;
}

function filterUsers() {
    const query = document.getElementById('user-search').value.toLowerCase();
    const filtered = allUsers.filter(u =>
        u.username.toLowerCase().includes(query) ||
        (u.linkedName && u.linkedName.toLowerCase().includes(query))
    );
    renderUsersTable(filtered);
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

// --- Edit User Logic ---

function openEditModal(uid, username, role) {
    document.getElementById('edit-uid').value = uid;
    document.getElementById('edit-username-display').innerText = username;
    document.getElementById('edit-role').value = role;
    document.getElementById('edit-new-password').value = "";
    document.getElementById('edit-msg').innerText = "";
    document.getElementById('edit-error').innerText = "";

    document.getElementById('edit-user-modal').style.display = "block";
}

function closeEditModal() {
    document.getElementById('edit-user-modal').style.display = "none";
}

async function saveUserChanges() {
    const uid = document.getElementById('edit-uid').value;
    const role = document.getElementById('edit-role').value;
    const newPass = document.getElementById('edit-new-password').value.trim();

    const msg = document.getElementById('edit-msg');
    const err = document.getElementById('edit-error');

    msg.innerText = "Guardando...";
    err.innerText = "";

    try {
        // 1. Update Firestore Role
        await db.collection('users').doc(uid).update({ role: role });

        // 2. Update Password (via Cloud Function)
        if (newPass) {
             msg.innerText = "Actualizando contraseña en servidor...";
             // Call the new Cloud Function
             const resetUserPassword = firebase.functions().httpsCallable('resetUserPassword');

             await resetUserPassword({ uid: uid, newPassword: newPass });
             console.log("Password reset successful via function");
        }

        msg.innerText = "Cambios guardados correctamente.";
        setTimeout(closeEditModal, 1500);

    } catch (e) {
        console.error(e);
        err.innerText = "Error: " + e.message;
    }
}

// Close modal if clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('edit-user-modal');
  if (event.target == modal) {
    closeEditModal();
  }
}

// --- Schedule Generator Logic ---

let currentDraft = null; // Stores the generated schedule in memory
let availabilityData = {}; // Stores loaded availability

function switchAdminTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`tab-btn-${tab}`).classList.add('active');
}

async function generateSchedulePreview() {
    const monthKey = document.getElementById('gen-month').value; // "2026-02"
    const [year, month] = monthKey.split('-').map(Number);

    const btn = document.querySelector('button[onclick="generateSchedulePreview()"]');
    const originalText = btn.innerText;
    btn.innerText = "Generando...";
    btn.disabled = true;

    try {
        // 1. Fetch Availability for this month
        availabilityData = {};
        const snapshot = await db.collection("availability").where("month", "==", monthKey).get();
        snapshot.forEach(doc => {
            const data = doc.data();
            // data.slots is array of "YYYY-MM-DD_Time"
            data.slots.forEach(slotKey => {
                if (!availabilityData[slotKey]) availabilityData[slotKey] = [];
                availabilityData[slotKey].push(data.linkedName);
            });
        });

        // 2. Define Structure (Simplified for Beta)
        // In real app, this should be configurable
        const locations = ["Costanera", "Liberty"];
        const shifts = ["08:00 a 10:00", "10:00 a 12:00"];
        // Note: Weekend afternoons? Omitted for simplicity in beta unless requested.

        const daysInMonth = new Date(year, month, 0).getDate();
        currentDraft = [];

        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat

            // Skip if logic requires (e.g. no Mondays?) - assuming all days active

            locations.forEach(loc => {
                shifts.forEach(time => {
                    const slotKey = `${dateStr}_${time}`;
                    const candidates = availabilityData[slotKey] || [];

                    // Algorithm: Pick up to 2 random candidates
                    // Improvement: Track usage count to balance load
                    const assigned = pickCandidates(candidates, 2);

                    // Fill remaining spots with "Disponible"
                    while (assigned.length < 2) {
                        assigned.push("Disponible");
                    }

                    currentDraft.push({
                        date: dateStr,
                        dayLabel: dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
                        location: loc,
                        time: time,
                        participants: assigned
                    });
                });
            });
        }

        renderDraftTable();
        document.getElementById('schedule-preview-container').style.display = 'block';

    } catch (err) {
        console.error("Error generating schedule:", err);
        alert("Error: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function pickCandidates(candidates, count) {
    // Simple shuffle and slice
    const shuffled = [...candidates].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function renderDraftTable() {
    const thead = document.getElementById('preview-head');
    const tbody = document.getElementById('preview-body');

    thead.innerHTML = `
        <tr>
            <th>Fecha</th>
            <th>Ubicación</th>
            <th>Hora</th>
            <th>Asignados (Sugerencia)</th>
        </tr>
    `;

    tbody.innerHTML = currentDraft.map(slot => `
        <tr>
            <td>${slot.date}</td>
            <td>${slot.location}</td>
            <td>${slot.time}</td>
            <td>${slot.participants.join(', ')}</td>
        </tr>
    `).join('');
}

async function publishSchedule() {
    if (!currentDraft) return;
    if (!confirm("¿Estás seguro de publicar este programa? Esto creará los turnos en la base de datos visible para todos.")) return;

    const btn = document.querySelector('button[onclick="publishSchedule()"]');
    btn.innerText = "Publicando...";
    btn.disabled = true;

    const batch = db.batch();
    let count = 0;

    // Track unique days to create Day objects
    const daysMap = new Map();

    currentDraft.forEach(slot => {
        // Prepare Day Data
        if (!daysMap.has(slot.date)) {
            daysMap.set(slot.date, {
                date: slot.date,
                dayLabel: slot.dayLabel, // "lunes, 2 de febrero"
                managers: [] // Managers logic not implemented in generator yet
            });
        }

        // Create Shift Doc
        // ID: Date_Loc_Time (sanitized)
        const id = `${slot.date}_${slot.location.replace(/\s/g,'')}_${slot.time.replace(/[^0-9]/g,'')}`;
        const shiftRef = db.collection("shifts").doc(id);

        const isOpen = slot.participants.some(p => p === "Disponible");

        batch.set(shiftRef, {
            date: slot.date,
            location: slot.location,
            time: slot.time,
            participants: slot.participants,
            status: isOpen ? 'open' : 'full'
        });
        count++;
    });

    // Create Day Docs
    daysMap.forEach((val, key) => {
        const dayRef = db.collection("days").doc(key);
        batch.set(dayRef, val);
    });

    try {
        await batch.commit();
        alert(`Programa publicado con éxito! ${count} turnos creados.`);
        document.getElementById('schedule-preview-container').style.display = 'none';
    } catch (err) {
        console.error("Error publishing:", err);
        alert("Error publicando: " + err.message);
    } finally {
        btn.innerText = "Publicar Programa";
        btn.disabled = false;
    }
}
