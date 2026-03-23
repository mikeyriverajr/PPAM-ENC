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

// Initialize Main Firebase App (For your Admin Session)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Secondary App (The "Ghost" app to create users without logging you out)
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    
    // Load the default active tab data
    loadPublishers(); 
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
  if (tabId === 'users') loadPublishers();
}

// ==========================================
// TAB 1: DIRECTORIO LOGIC (NEW)
// ==========================================

let allPublishers = []; // Global array to hold publishers for the partner dropdown

async function loadPublishers() {
  const listDiv = document.getElementById('publishers-list');
  const partnerSelect = document.getElementById('pub-partner');
  
  listDiv.innerHTML = '<p style="color:#666;">Cargando directorio...</p>';
  
  try {
    const snapshot = await db.collection('publishers').orderBy('firstName').get();
    allPublishers = [];
    partnerSelect.innerHTML = '<option value="">Ninguna (Soltero/a)</option>';
    
    if (snapshot.empty) {
      listDiv.innerHTML = '<p style="color:#666;">No hay publicadores registrados.</p>';
      return;
    }
    
    listDiv.innerHTML = '';
    
    snapshot.forEach(doc => {
      const pub = doc.data();
      pub.id = doc.id;
      allPublishers.push(pub);
      
      // 1. Add to the Directorio List on the right
      const card = document.createElement('div');
      card.className = 'pub-card';
      card.style.cssText = "background:white; padding:15px; margin-bottom:10px; border:1px solid #ddd; border-radius:5px; display:flex; justify-content:space-between; align-items:center;";
      
      const genderIcon = pub.gender === 'M' ? '👩🏽' : '👨🏽';
      const partnerText = pub.partnerName ? `Pareja: ${pub.partnerName}` : 'Sin pareja asignada';
      const hardPairBadge = pub.hardPair ? `<span style="background:#dc3545; color:white; padding:2px 6px; border-radius:10px; font-size:0.7em; margin-left:5px;">Hard Pair</span>` : '';
      
      card.innerHTML = `
        <div>
          <h4 class="pub-name" style="margin:0 0 5px 0;">${genderIcon} ${pub.firstName} ${pub.lastName} ${hardPairBadge}</h4>
          <p style="margin:0; font-size:0.85em; color:#666;">${partnerText}</p>
        </div>
        <button onclick='editPublisher("${pub.id}")' style="width:auto; background:#5d7aa9; padding:5px 15px; margin:0;">Editar</button>
      `;
      listDiv.appendChild(card);
      
      // 2. Add to the Partner Dropdown on the left
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName}</option>`;
    });

  } catch (error) {
    listDiv.innerHTML = '<p class="error">Error al cargar el directorio.</p>';
    console.error(error);
  }
}

async function savePublisher() {
  const id = document.getElementById('pub-id').value;
  const firstName = document.getElementById('pub-firstname').value.trim();
  const lastName = document.getElementById('pub-lastname').value.trim();
  const gender = document.getElementById('pub-gender').value;
  const partnerId = document.getElementById('pub-partner').value;
  const hardPair = document.getElementById('pub-hardpair').checked;
  
  const email = document.getElementById('pub-email').value.trim();
  const password = document.getElementById('pub-password').value;
  const role = document.getElementById('pub-role').value;
  
  const msgP = document.getElementById('pub-msg');
  const errorP = document.getElementById('pub-error');
  
  msgP.innerText = ''; errorP.innerText = '';
  
  if (!firstName || !lastName) {
    errorP.innerText = 'El nombre y apellido son obligatorios.';
    return;
  }

  // Get the partner's name for display purposes if a partner is selected
  let partnerName = "";
  if (partnerId) {
    const partnerObj = allPublishers.find(p => p.id === partnerId);
    if (partnerObj) partnerName = `${partnerObj.firstName} ${partnerObj.lastName}`;
  }

  const pubData = {
    firstName: firstName,
    lastName: lastName,
    gender: gender,
    partner: partnerId,
    partnerName: partnerName,
    hardPair: hardPair
  };

  try {
    let finalPubId = id;

    if (id) {
      // UPDATE EXISTING PUBLISHER
      await db.collection('publishers').doc(id).update(pubData);
      msgP.innerText = 'Publicador actualizado exitosamente.';
    } else {
      // CREATE NEW PUBLISHER
      const newPubRef = await db.collection('publishers').add(pubData);
      finalPubId = newPubRef.id;
      
      // Handle Optional Account Creation using the "Ghost" app
      if (email && password) {
        if (password.length < 6) {
           errorP.innerText = 'El publicador se guardó, pero la contraseña debe tener al menos 6 caracteres.';
           loadPublishers(); return;
        }
        
        msgP.innerText = 'Creando publicador y cuenta web...';
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        
        // Link the new Auth UID to the Publisher Profile
        await db.collection('users').doc(userCred.user.uid).set({
          publisherId: finalPubId,
          role: role,
          email: email
        });
        
        // Log the ghost app out
        await secondaryAuth.signOut();
      }
      msgP.innerText = 'Publicador creado exitosamente.';
    }
    
    setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 1500);
    
  } catch (error) {
    errorP.innerText = 'Error: ' + error.message;
  }
}

function editPublisher(id) {
  const pub = allPublishers.find(p => p.id === id);
  if (!pub) return;
  
  document.getElementById('pub-id').value = pub.id;
  document.getElementById('pub-firstname').value = pub.firstName || '';
  document.getElementById('pub-lastname').value = pub.lastName || '';
  document.getElementById('pub-gender').value = pub.gender || 'H';
  document.getElementById('pub-partner').value = pub.partner || '';
  document.getElementById('pub-hardpair').checked = pub.hardPair || false;
  
  // Disable account creation fields during edit to avoid accidental overwrites
  document.getElementById('pub-email').disabled = true;
  document.getElementById('pub-password').disabled = true;
  document.getElementById('pub-role').disabled = true;
  document.getElementById('pub-email').placeholder = "No se puede editar aquí";
  document.getElementById('pub-password').placeholder = "No se puede editar aquí";
  
  document.getElementById('btn-cancel-pub').style.display = 'block';
  document.getElementById('pub-msg').innerText = 'Modo edición activado.';
  
  // Scroll to top to see the form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearPublisherForm() {
  document.getElementById('pub-id').value = '';
  document.getElementById('pub-firstname').value = '';
  document.getElementById('pub-lastname').value = '';
  document.getElementById('pub-gender').value = 'H';
  document.getElementById('pub-partner').value = '';
  document.getElementById('pub-hardpair').checked = false;
  
  document.getElementById('pub-email').value = '';
  document.getElementById('pub-password').value = '';
  
  document.getElementById('pub-email').disabled = false;
  document.getElementById('pub-password').disabled = false;
  document.getElementById('pub-role').disabled = false;
  document.getElementById('pub-email').placeholder = "ej. juan@email.com";
  document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
  
  document.getElementById('btn-cancel-pub').style.display = 'none';
  document.getElementById('pub-msg').innerText = '';
  document.getElementById('pub-error').innerText = '';
}

function filterPublishers() {
  const input = document.getElementById('pub-search').value.toLowerCase();
  const cards = document.querySelectorAll('.pub-card');
  
  cards.forEach(card => {
    const name = card.querySelector('.pub-name').innerText.toLowerCase();
    if (name.includes(input)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

// ==========================================
// TAB 2: LOCATIONS LOGIC (EXISTING)
// ==========================================

async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p style="color:#666;">Cargando ubicaciones...</p>';
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) {
      listDiv.innerHTML = '<p style="color:#666;">No hay ubicaciones registradas.</p>';
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
        <button onclick='editLocation("${doc.id}")' style="width:auto; background:#5d7aa9; padding:5px 15px; margin:0;">Editar</button>
      `;
      listDiv.appendChild(card);
    });
  } catch (error) { listDiv.innerHTML = '<p class="error">Error al cargar ubicaciones.</p>'; }
}

function openLocationModal() {
  document.getElementById('location-modal').style.display = 'block';
  document.getElementById('loc-msg').innerText = '';
  document.getElementById('loc-error').innerText = '';
  document.getElementById('loc-id').value = '';
  document.getElementById('loc-name').value = '';
  document.getElementById('loc-capacity').value = '2';
  document.getElementById('loc-modal-title').innerText = 'Nueva Ubicación';
  document.getElementById('btn-delete-loc').style.display = 'none';
  document.getElementById('shifts-container').innerHTML = `
    <button onclick="addShiftRow()" style="width:auto; background:#17a2b8; padding:5px 10px; font-size:0.9em; margin-bottom:10px;">+ Agregar Turno</button>
    <div id="shifts-rows-wrapper"></div>
  `;
  addShiftRow(); 
}

function closeLocationModal() { document.getElementById('location-modal').style.display = 'none'; }

function addShiftRow(day = 'Lunes', start = '08:00', end = '10:00') {
  const container = document.getElementById('shifts-rows-wrapper') || document.getElementById('shifts-container');
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const row = document.createElement('div');
  row.className = 'shift-row';
  row.style.cssText = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
  let options = days.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('');
  row.innerHTML = `
    <select class="shift-day" style="margin:0; flex:2;">${options}</select>
    <input type="time" class="shift-start" value="${start}" style="margin:0; flex:1;">
    <input type="time" class="shift-end" value="${end}" style="margin:0; flex:1;">
    <button onclick="this.parentElement.remove()" style="margin:0; width:auto; background:#dc3545; padding:8px 12px;">X</button>
  `;
  container.appendChild(row);
}

async function saveLocation() {
  const id = document.getElementById('loc-id').value;
  const name = document.getElementById('loc-name').value.trim();
  const capacity = parseInt(document.getElementById('loc-capacity').value) || 2;
  const errorP = document.getElementById('loc-error');
  const msgP = document.getElementById('loc-msg');
  if (!name) { errorP.innerText = 'El nombre es obligatorio.'; return; }
  
  const templates = [];
  document.querySelectorAll('.shift-row').forEach(row => {
    templates.push({
      day: row.querySelector('.shift-day').value,
      startTime: row.querySelector('.shift-start').value,
      endTime: row.querySelector('.shift-end').value
    });
  });

  const locationData = { name, capacity, isActive: true, templates };

  try {
    if (id) {
      await db.collection('locations').doc(id).update(locationData);
      msgP.innerText = 'Ubicación actualizada.';
    } else {
      await db.collection('locations').add(locationData);
      msgP.innerText = 'Ubicación creada.';
    }
    setTimeout(() => { closeLocationModal(); loadLocations(); }, 1000);
  } catch (error) { errorP.innerText = 'Error al guardar: ' + error.message; }
}

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
    document.getElementById('shifts-container').innerHTML = `
      <button onclick="addShiftRow()" style="width:auto; background:#17a2b8; padding:5px 10px; font-size:0.9em; margin-bottom:10px;">+ Agregar Turno</button>
      <div id="shifts-rows-wrapper"></div>
    `;
    if (loc.templates && loc.templates.length > 0) {
      loc.templates.forEach(t => addShiftRow(t.day, t.startTime, t.endTime));
    } else { addShiftRow(); }
  } catch (error) { document.getElementById('loc-error').innerText = 'Error al cargar datos.'; }
}

async function deleteLocation() {
  const id = document.getElementById('loc-id').value;
  if (!confirm('¿Estás seguro de eliminar esta ubicación?')) return;
  try {
    await db.collection('locations').doc(id).delete();
    closeLocationModal();
    loadLocations();
  } catch (error) { document.getElementById('loc-error').innerText = 'Error al eliminar.'; }
}
