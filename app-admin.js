// Initialize Main App (for Admin Auth)
// Self-Contained Configuration to avoid dependency on HTML/External file
const config = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

const mainApp = firebase.initializeApp(config);
const mainAuth = mainApp.auth();
const db = mainApp.firestore();

// Initialize Secondary App (for User Creation without logout)
const secondaryApp = firebase.initializeApp(config, "Secondary");
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
    console.log("Opening edit modal for:", uid, username); // DEBUG
    
    const modal = document.getElementById('edit-user-modal');
    if (!modal) {
        console.error("Modal element not found!");
        return;
    }
    
    document.getElementById('edit-uid').value = uid;
    document.getElementById('edit-username-display').innerText = username;
    document.getElementById('edit-role').value = role;
    document.getElementById('edit-new-password').value = "";
    document.getElementById('edit-msg').innerText = "";
    document.getElementById('edit-error').innerText = "";
    
    modal.style.display = "block";
    // Ensure high z-index and center just in case style.css overrides
    modal.style.zIndex = "10000"; 
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
    
    if (tab === 'locations') {
        loadLocations();
    }
}

// --- Locations Module ---

let allLocations = [];
const DAYS_OF_WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function loadLocations() {
    const div = document.getElementById('locations-list');
    div.innerHTML = "Cargando...";
    
    db.collection('locations').orderBy('name').onSnapshot(snap => {
        allLocations = [];
        let html = "";
        
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            allLocations.push(d);
            
            // Format schedule summary
            let scheduleSummary = "";
            DAYS_OF_WEEK.forEach(day => {
                if(d.weeklySchedule && d.weeklySchedule[day] && d.weeklySchedule[day].length > 0) {
                    scheduleSummary += `<b>${day.substring(0,3)}:</b> ${d.weeklySchedule[day].join(', ')}<br>`;
                }
            });
            if(!scheduleSummary) scheduleSummary = "Sin horarios";

            html += `
            <div style="background:white; border:1px solid #ddd; padding:15px; border-radius:5px; margin-bottom:10px; display:flex; justify-content:space-between;">
                <div>
                    <h3 style="margin:0;">${d.name} <span style="font-size:0.6em; font-weight:normal; color:#666;">(Capacidad: ${d.capacity})</span></h3>
                    ${d.link ? `<a href="${d.link}" target="_blank" style="font-size:0.8em;">Ver Mapa</a>` : ""}
                    <div style="margin-top:10px; font-size:0.8em; color:#555;">${scheduleSummary}</div>
                </div>
                <div>
                    <button onclick='openLocationModal(${JSON.stringify(d).replace(/'/g, "&#39;")})' style="padding:5px 15px; font-size:0.9em; background:#ffc107; color:black; width:auto;">Editar</button>
                </div>
            </div>`;
        });
        
        if (html === "") html = "<p>No hay ubicaciones creadas.</p>";
        div.innerHTML = html;
    });
}

function openLocationModal(locData = null) {
    const modal = document.getElementById('location-modal');
    modal.style.display = "block";
    modal.style.zIndex = "10000";
    
    document.getElementById('loc-msg').innerText = "";
    document.getElementById('loc-error').innerText = "";
    
    // Setup Schedule Editor
    const scheduleContainer = document.getElementById('loc-schedule-editor');
    scheduleContainer.innerHTML = "";
    
    let currentSchedule = locData ? (locData.weeklySchedule || {}) : {};
    
    DAYS_OF_WEEK.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.style.marginBottom = "10px";
        dayDiv.innerHTML = `<strong>${day}</strong> <button onclick="addTimeSlot('${day}')" style="font-size:0.7em; padding:2px 5px; width:auto;">+ Agregar</button>`;
        
        const slotsDiv = document.createElement('div');
        slotsDiv.id = `slots-${day}`;
        
        // Add existing slots
        if (currentSchedule[day]) {
            currentSchedule[day].forEach(timeStr => {
                // timeStr expected "08:00-10:00"
                addTimeSlotToDOM(slotsDiv, timeStr);
            });
        }
        
        dayDiv.appendChild(slotsDiv);
        scheduleContainer.appendChild(dayDiv);
    });

    if (locData) {
        document.getElementById('loc-modal-title').innerText = "Editar Ubicación";
        document.getElementById('loc-id').value = locData.id;
        document.getElementById('loc-name').value = locData.name;
        document.getElementById('loc-link').value = locData.link || "";
        document.getElementById('loc-capacity').value = locData.capacity || 2;
        document.getElementById('btn-delete-loc').style.display = "inline-block";
        // Store original capacity for validation
        modal.dataset.originalCapacity = locData.capacity || 2;
    } else {
        document.getElementById('loc-modal-title').innerText = "Nueva Ubicación";
        document.getElementById('loc-id').value = "";
        document.getElementById('loc-name').value = "";
        document.getElementById('loc-link').value = "";
        document.getElementById('loc-capacity').value = 2;
        document.getElementById('btn-delete-loc').style.display = "none";
        modal.dataset.originalCapacity = 0;
    }
}

function addTimeSlot(day) {
    const container = document.getElementById(`slots-${day}`);
    addTimeSlotToDOM(container, "");
}

function addTimeSlotToDOM(container, value) {
    const div = document.createElement('div');
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.marginTop = "5px";
    
    // Parse value "08:00-10:00" -> start, end
    let start = "08:00";
    let end = "10:00";
    if (value) {
        [start, end] = value.split('-');
    }
    
    div.innerHTML = `
        <input type="time" class="time-start" value="${start.trim()}" style="width:auto; padding:2px;"> 
        <span style="margin:0 5px;">a</span>
        <input type="time" class="time-end" value="${end.trim()}" style="width:auto; padding:2px;">
        <button onclick="this.parentElement.remove()" style="background:none; color:red; border:none; width:auto; cursor:pointer; font-weight:bold; margin-left:5px;">×</button>
    `;
    container.appendChild(div);
}

function closeLocationModal() {
    document.getElementById('location-modal').style.display = "none";
}

async function saveLocation() {
    const id = document.getElementById('loc-id').value;
    const name = document.getElementById('loc-name').value.trim();
    const link = document.getElementById('loc-link').value.trim();
    const capacity = parseInt(document.getElementById('loc-capacity').value);
    
    const msg = document.getElementById('loc-msg');
    const err = document.getElementById('loc-error');
    msg.innerText = "";
    err.innerText = "";
    
    if (!name) { err.innerText = "El nombre es obligatorio."; return; }
    
    // Parse Schedule
    const weeklySchedule = {};
    DAYS_OF_WEEK.forEach(day => {
        const slotsDiv = document.getElementById(`slots-${day}`);
        const inputs = slotsDiv.querySelectorAll('div'); // each row
        const times = [];
        inputs.forEach(row => {
            const start = row.querySelector('.time-start').value;
            const end = row.querySelector('.time-end').value;
            if (start && end) {
                times.push(`${start}-${end}`);
            }
        });
        if (times.length > 0) weeklySchedule[day] = times;
    });
    
    // Validation: Reducing Capacity
    const originalCap = parseInt(document.getElementById('location-modal').dataset.originalCapacity);
    if (id && capacity < originalCap) {
        // Must check if any future shift has > new capacity
        msg.innerText = "Validando cambios de capacidad...";
        const futureShifts = await db.collection('shifts')
            .where('location', '==', name) // This assumes ID == Name, if we change ID to UUID this breaks. 
            // We'll stick to ID=Name for simplicity or handle migration.
            // Actually, we use 'location' field in shifts which is the Name.
            .get();
            
        let conflict = false;
        futureShifts.forEach(doc => {
            const d = doc.data();
            // Count actual humans (not "Disponible")
            const humans = d.participants.filter(p => !p.toLowerCase().includes('disponible')).length;
            if (humans > capacity) {
                conflict = true;
            }
        });
        
        if (conflict) {
            err.innerText = "No puedes reducir la capacidad porque hay turnos futuros con más asignados. Cancela esos turnos primero.";
            return;
        }
    }

    try {
        const docId = id || name; // Use name as ID for simplicity so 'location' field matches
        // Note: If renaming, we need to handle that. For now, assume Create/Edit same ID.
        // If 'id' is set, we use it. If not, we create new doc with name.
        
        await db.collection('locations').doc(docId).set({
            name, link, capacity, weeklySchedule
        }, { merge: true });
        
        msg.innerText = "Guardado exitosamente.";
        setTimeout(closeLocationModal, 1000);
    } catch (e) {
        console.error(e);
        err.innerText = "Error: " + e.message;
    }
}

async function deleteLocation() {
    const id = document.getElementById('loc-id').value;
    if (!confirm("¿ESTÁS SEGURO? Si eliminas esta ubicación, se perderá la configuración.")) return;
    
    // Check for shifts
    const shiftsSnap = await db.collection('shifts').where('location', '==', id).get();
    if (!shiftsSnap.empty) {
        if (!confirm(`ADVERTENCIA: Hay ${shiftsSnap.size} turnos (pasados o futuros) asociados a esta ubicación. ¿Quieres eliminarlos TODOS?`)) return;
        if (!confirm("Esta acción es irreversible. ¿Confirmas borrar la ubicación y sus turnos?")) return;
        
        // Batch delete shifts
        const batch = db.batch();
        shiftsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
    
    await db.collection('locations').doc(id).delete();
    closeLocationModal();
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
