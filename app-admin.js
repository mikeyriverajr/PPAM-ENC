// app-admin.js - Complete File with Generator Algorithm

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

// Initialize Main Firebase App
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Secondary App (The "Ghost" app)
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
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
  auth.signInWithEmailAndPassword(email, pass).catch(error => { errorDiv.innerText = "Error: " + error.message; });
}

function logout() { auth.signOut(); }

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
// TAB 1: DIRECTORIO LOGIC
// ==========================================
let allPublishers = []; 

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
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName}</option>`;
    });
  } catch (error) { listDiv.innerHTML = '<p class="error">Error al cargar el directorio.</p>'; }
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
  const emailIsDisabled = document.getElementById('pub-email').disabled;
  const msgP = document.getElementById('pub-msg');
  const errorP = document.getElementById('pub-error');
  
  msgP.innerText = ''; errorP.innerText = '';
  if (!firstName || !lastName) { errorP.innerText = 'El nombre y apellido son obligatorios.'; return; }

  let partnerName = "";
  if (partnerId) {
    const partnerObj = allPublishers.find(p => p.id === partnerId);
    if (partnerObj) partnerName = `${partnerObj.firstName} ${partnerObj.lastName}`;
  }

  const pubData = { firstName, lastName, gender, partner: partnerId, partnerName, hardPair };

  try {
    if (id) {
      await db.collection('publishers').doc(id).update(pubData);
      if (email && password && !emailIsDisabled) {
        if (password.length < 6) { errorP.innerText = 'Contraseña requiere 6+ caracteres.'; setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 2500); return; }
        msgP.innerText = 'Actualizando cuenta web...';
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: id, role: role, email: email });
        await secondaryAuth.signOut();
      }
      msgP.innerText = 'Actualizado exitosamente.';
    } else {
      const newPubRef = await db.collection('publishers').add(pubData);
      if (email && password) {
        if (password.length < 6) { errorP.innerText = 'Contraseña requiere 6+ caracteres.'; setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 2500); return; }
        msgP.innerText = 'Creando cuenta web...';
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: newPubRef.id, role: role, email: email });
        await secondaryAuth.signOut();
      }
      msgP.innerText = 'Creado exitosamente.';
    }
    setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 1500);
  } catch (error) { errorP.innerText = 'Error: ' + error.message; }
}

async function editPublisher(id) {
  const pub = allPublishers.find(p => p.id === id);
  if (!pub) return;
  document.getElementById('pub-form-title').innerText = 'Editar Publicador';
  document.getElementById('pub-id').value = pub.id;
  document.getElementById('pub-firstname').value = pub.firstName || '';
  document.getElementById('pub-lastname').value = pub.lastName || '';
  document.getElementById('pub-gender').value = pub.gender || 'H';
  document.getElementById('pub-partner').value = pub.partner || '';
  document.getElementById('pub-hardpair').checked = pub.hardPair || false;
  document.getElementById('btn-cancel-pub').style.display = 'block';
  document.getElementById('btn-delete-pub').style.display = 'block';
  document.getElementById('pub-msg').innerText = 'Revisando estado de la cuenta...';
  
  const userQuery = await db.collection('users').where('publisherId', '==', id).get();
  if (!userQuery.empty) {
     const userData = userQuery.docs[0].data();
     document.getElementById('pub-email').value = userData.email || '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-email').disabled = true;
     document.getElementById('pub-password').disabled = true;
     document.getElementById('pub-role').value = userData.role || 'user';
     document.getElementById('pub-password').placeholder = "Cuenta vinculada (Bloqueado)";
     document.getElementById('account-status-msg').innerText = "✅ Este publicador ya tiene una cuenta web vinculada.";
  } else {
     document.getElementById('pub-email').value = '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-email').disabled = false;
     document.getElementById('pub-password').disabled = false;
     document.getElementById('pub-role').value = 'user';
     document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
     document.getElementById('account-status-msg').innerText = "⚠️ Sin cuenta. Puedes crearle una ahora.";
  }
  document.getElementById('pub-msg').innerText = 'Modo edición activado.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePublisher() {
  const id = document.getElementById('pub-id').value;
  if (!id) return;
  if (!confirm('¿Estás seguro de eliminar este publicador?')) return;
  try {
    document.getElementById('pub-msg').innerText = 'Eliminando...';
    await db.collection('publishers').doc(id).delete();
    const userQuery = await db.collection('users').where('publisherId', '==', id).get();
    userQuery.forEach(async (doc) => { await db.collection('users').doc(doc.id).delete(); });
    clearPublisherForm();
    loadPublishers();
  } catch (error) { document.getElementById('pub-error').innerText = "Error: " + error.message; }
}

function clearPublisherForm() {
  document.getElementById('pub-form-title').innerText = 'Nuevo Publicador';
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
  document.getElementById('btn-delete-pub').style.display = 'none';
  document.getElementById('account-status-msg').innerText = '';
  document.getElementById('pub-msg').innerText = '';
  document.getElementById('pub-error').innerText = '';
}

function filterPublishers() {
  const input = document.getElementById('pub-search').value.toLowerCase();
  const cards = document.querySelectorAll('.pub-card');
  cards.forEach(card => {
    const name = card.querySelector('.pub-name').innerText.toLowerCase();
    card.style.display = name.includes(input) ? 'flex' : 'none';
  });
}

// ==========================================
// TAB 2: LOCATIONS LOGIC
// ==========================================
async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p style="color:#666;">Cargando ubicaciones...</p>';
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666;">No hay ubicaciones registradas.</p>'; return; }
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

// ==========================================
// TAB 3: SCHEDULE GENERATOR (THE BRAIN)
// ==========================================

let draftSchedule = []; // Holds the generated shifts in memory before publishing

async function generateDraft() {
  const btn = document.querySelector('#tab-schedule button');
  btn.innerText = "Generando Programa...";
  btn.disabled = true;

  try {
    // 1. Setup Targets
    const monthVal = document.getElementById('gen-month').value; // e.g. "2026-04"
    const [targetYearStr, targetMonthStr] = monthVal.split('-');
    const targetYear = parseInt(targetYearStr);
    const targetMonthIndex = parseInt(targetMonthStr) - 1; // JS Months are 0-indexed

    // 2. Fetch Fresh Data
    const pubsSnap = await db.collection('publishers').get();
    const locsSnap = await db.collection('locations').where('isActive', '==', true).get();

    const publishers = [];
    pubsSnap.forEach(d => { let p=d.data(); p.id=d.id; publishers.push(p); });
    const locations = [];
    locsSnap.forEach(d => { let l=d.data(); l.id=d.id; locations.push(l); });

    // Helper: Standardize date format YYYY-MM-DD
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // 3. Create the empty Shift Tasks for the whole month
    const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
    const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let shiftTasks = [];

    for (let d = 1; d <= daysInMonth; d++) {
      let dateObj = new Date(targetYear, targetMonthIndex, d);
      let dayName = daysMap[dateObj.getDay()];
      let dateString = formatDate(dateObj);

      locations.forEach(loc => {
        (loc.templates || []).forEach(t => {
          if (t.day === dayName) {
            shiftTasks.push({
              dateObj: dateObj,
              dateString: dateString,
              location: loc.name,
              time: `${t.startTime}-${t.endTime}`,
              capacity: loc.capacity,
              availKey: `${loc.name}_${t.day}_${t.startTime}`, // Matches their saved routines
              pool: [],
              assigned: []
            });
          }
        });
      });
    }

    // 4. Build Candidate Pools (Who is available for what?)
    publishers.forEach(pub => {
      const avail = pub.availability || [];
      shiftTasks.forEach(task => {
        if (avail.includes(task.availKey)) {
          task.pool.push(pub);
        }
      });
    });

    // 5. Scarcity Sort: Shifts with fewest available people get filled first
    shiftTasks.sort((a, b) => a.pool.length - b.pool.length);

    // 6. Assignment Core Logic (The Rules Engine)
    let assignedCounts = {}; // pub.id -> number of shifts
    let assignedDates = {};  // pub.id -> Set of dateStrings worked

    function canAssign(pubId, dateObj, dateString) {
      if ((assignedCounts[pubId] || 0) >= 5) return false; // MAX 5 SHIFTS CAP
      if (assignedDates[pubId] && assignedDates[pubId].has(dateString)) return false; // ALREADY WORKING TODAY

      // NO CONSECUTIVE DAYS CAP
      let prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
      let nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);
      if (assignedDates[pubId] && (assignedDates[pubId].has(formatDate(prevDate)) || assignedDates[pubId].has(formatDate(nextDate)))) {
        return false;
      }
      return true;
    }

    shiftTasks.forEach(task => {
      task.pool.forEach(pub => {
        if (task.assigned.length >= task.capacity) return; // Shift is full
        if (task.assigned.find(a => a.id === pub.id)) return; // Already in this shift
        if (!canAssign(pub.id, task.dateObj, task.dateString)) return; // Broke a rule

        // Check Hard Couples Rule
        if (pub.hardPair && pub.partner) {
          let partner = publishers.find(p => p.id === pub.partner);
          if (!partner) return;
          
          let partnerInPool = task.pool.find(p => p.id === partner.id);
          if (!partnerInPool) return; // Partner isn't available for this shift
          if (!canAssign(partner.id, task.dateObj, task.dateString)) return; // Partner broke a rule

          if (task.assigned.length + 2 <= task.capacity) { // Is there room for two?
            task.assigned.push(pub);
            task.assigned.push(partner);
            
            // Mark tracking for both
            assignedCounts[pub.id] = (assignedCounts[pub.id] || 0) + 1;
            assignedCounts[partner.id] = (assignedCounts[partner.id] || 0) + 1;
            if(!assignedDates[pub.id]) assignedDates[pub.id] = new Set();
            if(!assignedDates[partner.id]) assignedDates[partner.id] = new Set();
            assignedDates[pub.id].add(task.dateString);
            assignedDates[partner.id].add(task.dateString);
          }
        } else if (!pub.hardPair) {
          // Single assignment
          task.assigned.push(pub);
          assignedCounts[pub.id] = (assignedCounts[pub.id] || 0) + 1;
          if(!assignedDates[pub.id]) assignedDates[pub.id] = new Set();
          assignedDates[pub.id].add(task.dateString);
        }
      });
    });

    // 7. Render Preview
    draftSchedule = shiftTasks.sort((a,b) => a.dateObj - b.dateObj); // Sort chronologically for display
    renderPreviewTable();

  } catch (error) {
    console.error("Generator Error:", error);
    alert("Hubo un error al generar: " + error.message);
  } finally {
    btn.innerText = "Generar Propuesta (Borrador)";
    btn.disabled = false;
  }
}

function renderPreviewTable() {
  document.getElementById('schedule-preview-container').style.display = 'block';
  const tbody = document.getElementById('preview-body');
  const thead = document.getElementById('preview-head');
  
  thead.innerHTML = `<tr><th>Fecha</th><th>Lugar</th><th>Horario</th><th>Asignados</th></tr>`;
  tbody.innerHTML = '';

  draftSchedule.forEach(shift => {
    const names = shift.assigned.map(p => `${p.firstName} ${p.lastName}`).join(', ');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${shift.dateString}</td>
      <td>${shift.location}</td>
      <td>${shift.time}</td>
      <td style="color:${shift.assigned.length < shift.capacity ? '#dc3545' : '#28a745'}; font-weight:bold;">
        ${names || 'Nadie disponible'} (${shift.assigned.length}/${shift.capacity})
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function publishSchedule() {
  if (draftSchedule.length === 0) return;
  if (!confirm('¿Estás seguro de publicar este mes? Esto sobrescribirá cualquier turno manual en estas fechas.')) return;

  const btn = document.querySelector('#schedule-preview-container button');
  btn.innerText = "Publicando a la Base de Datos...";
  btn.disabled = true;

  try {
    // Optional: You could delete old shifts in this month first to avoid duplicates, 
    // but for the beta we just push the new generated shifts.
    for (const shift of draftSchedule) {
      if (shift.assigned.length > 0) { // Only save shifts that actually got people assigned
        await db.collection('shifts').add({
          date: shift.dateString,
          location: shift.location,
          time: shift.time,
          participants: shift.assigned.map(p => p.id) // Save Publisher IDs, not names!
        });
      }
    }
    
    alert('¡Programa publicado con éxito! Ya está visible para los publicadores.');
    document.getElementById('schedule-preview-container').style.display = 'none';
    draftSchedule = []; // Clear memory
    
  } catch (error) {
    console.error("Publish Error:", error);
    alert("Error al publicar: " + error.message);
  } finally {
    btn.innerText = "Publicar Programa";
    btn.disabled = false;
  }
}
