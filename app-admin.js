// app-admin.js - Complete File

// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    
    // Load the default active tab data
    loadLocations(); 
  } else {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
  }
});

function adminLogin() {
  const email = document.getElementById('admin-user').value;
  const pass = document.getElementById('admin-pass').value;
  const errorDiv = document.getElementById('login-error');
  
  errorDiv.innerText = "";
  auth.signInWithEmailAndPassword(email, pass)
    .catch(error => { errorDiv.innerText = "Error: " + error.message; });
}

function logout() {
  auth.signOut();
}

// --- UI NAVIGATION ---
function switchAdminTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.getElementById('tab-btn-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  
  if (tabId === 'locations') loadLocations();
  // We will add loadUsers() and loadSchedule() later!
}

// --- LOCATIONS LOGIC (STEP 1) ---

// 1. Fetch and display locations
async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p>Cargando...</p>';
  
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) {
      listDiv.innerHTML = '<p>No hay ubicaciones registradas.</p>';
      return;
    }
    
    listDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const loc = doc.data();
      const card = document.createElement('div');
      card.style.cssText = "background:white; padding:15px; margin-bottom:10px; border:1px solid #ddd; border-radius:5px; display:flex; justify-content:space-between; align-items:center;";
      
      const shiftsSummary = (loc.templates || []).map(t => `${t.day} ${t.startTime}-${t.endTime}`).join(', ');
      
      card.innerHTML = `
        <div>
          <h4 style="margin:0 0 5px 0;">${loc.name} (Capacidad: ${loc.capacity})</h4>
          <p style="margin:0; font-size:0.85em; color:#666;">Turnos: ${shiftsSummary || 'Ninguno'}</p>
        </div>
        <button onclick='editLocation("${doc.id}")' style="width:auto; background:#5d7aa9; padding:5px 15px;">Editar</button>
      `;
      listDiv.appendChild(card);
    });
  } catch (error) {
    listDiv.innerHTML = '<p class="error">Error al cargar ubicaciones.</p>';
  }
}

// 2. Open Modal for New/Edit
function openLocationModal() {
  document.getElementById('location-modal').style.display = 'block';
  document.getElementById('loc-msg').innerText = '';
  document.getElementById('loc-error').innerText = '';
  
  // Clear fields
  document.getElementById('loc-id').value = '';
  document.getElementById('loc-name').value = '';
  document.getElementById('loc-capacity').value = '2';
  document.getElementById('loc-modal-title').innerText = 'Nueva Ubicación';
  document.getElementById('btn-delete-loc').style.display = 'none';
  
  // Reset shifts area
  document.getElementById('loc-schedule-editor').innerHTML = `
    <button onclick="addShiftRow()" style="width:auto; background:#17a2b8; padding:5px 10px; font-size:0.9em; margin-bottom:10px;">+ Agregar Turno</button>
    <div id="shifts-container"></div>
  `;
  addShiftRow(); // Add one empty row by default
}

function closeLocationModal() {
  document.getElementById('location-modal').style.display = 'none';
}

// 3. Dynamic Shift Rows
function addShiftRow(day = 'Lunes', start = '08:00', end = '10:00') {
  const container = document.getElementById('shifts-container');
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  
  const row = document.createElement('div');
  row.className = 'shift-row';
  row.style.cssText = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
  
  let options = days.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('');
  
  row.innerHTML = `
    <select class="shift-day" style="margin:0; flex:2;">${options}</select>
    <input type="time" class="shift-start" value="${start}" style="margin:0; flex:1;">
    <input type="time" class="shift-end" value="${end}" style="margin:0; flex:1;">
    <button onclick="this.parentElement.remove()" style="margin:0; width:auto; background:#d9534f; padding:8px 12px;">X</button>
  `;
  container.appendChild(row);
}

// 4. Save Location to Firebase
async function saveLocation() {
  const id = document.getElementById('loc-id').value;
  const name = document.getElementById('loc-name').value.trim();
  const capacity = parseInt(document.getElementById('loc-capacity').value) || 2;
  const errorP = document.getElementById('loc-error');
  const msgP = document.getElementById('loc-msg');
  
  if (!name) { errorP.innerText = 'El nombre es obligatorio.'; return; }
  
  // Gather shift templates
  const templates = [];
  document.querySelectorAll('.shift-row').forEach(row => {
    templates.push({
      day: row.querySelector('.shift-day').value,
      startTime: row.querySelector('.shift-start').value,
      endTime: row.querySelector('.shift-end').value
    });
  });

  const locationData = {
    name: name,
    capacity: capacity,
    isActive: true,
    templates: templates
  };

  try {
    if (id) {
      await db.collection('locations').doc(id).update(locationData);
      msgP.innerText = 'Ubicación actualizada.';
    } else {
      await db.collection('locations').add(locationData);
      msgP.innerText = 'Ubicación creada.';
    }
    setTimeout(() => { closeLocationModal(); loadLocations(); }, 1000);
  } catch (error) {
    errorP.innerText = 'Error al guardar: ' + error.message;
  }
}

// 5. Edit Existing Location
async function editLocation(id) {
  openLocationModal();
  document.getElementById('loc-modal-title').innerText = 'Editar Ubicación';
  document.getElementById('loc-id').value = id;
  document.getElementById('btn-delete-loc').style.display = 'inline-block';
  
  try {
    const doc = await db.collection('locations').doc(id).get();
    const loc = doc.data();
    
    document.getElementById('loc-name').value = loc.name;
    document.getElementById('loc-capacity').value = loc.capacity;
    
    document.getElementById('shifts-container').innerHTML = '';
    if (loc.templates && loc.templates.length > 0) {
      loc.templates.forEach(t => addShiftRow(t.day, t.startTime, t.endTime));
    } else {
      addShiftRow();
    }
  } catch (error) {
    document.getElementById('loc-error').innerText = 'Error al cargar datos.';
  }
}

// 6. Delete Location
async function deleteLocation() {
  const id = document.getElementById('loc-id').value;
  if (!confirm('¿Estás seguro de eliminar esta ubicación?')) return;
  
  try {
    await db.collection('locations').doc(id).delete();
    closeLocationModal();
    loadLocations();
  } catch (error) {
    document.getElementById('loc-error').innerText = 'Error al eliminar.';
  }
}
