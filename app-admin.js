// app-admin.js - Complete File
const firebaseConfig = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  auth.signInWithEmailAndPassword(email, pass).catch(e => { errorDiv.innerText = "Error: " + e.message; });
}

function logout() { auth.signOut(); }

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
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666;">No hay publicadores registrados.</p>'; return; }
    listDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const pub = doc.data(); pub.id = doc.id; allPublishers.push(pub);
      const card = document.createElement('div');
      card.className = 'pub-card';
      card.style.cssText = "background:white; padding:15px; margin-bottom:10px; border:1px solid #ddd; border-radius:5px; display:flex; justify-content:space-between; align-items:center;";
      const genderIcon = pub.gender === 'M' ? '👩🏽' : '👨🏽';
      const partnerText = pub.partnerName ? `Pareja: ${pub.partnerName}` : 'Sin pareja asignada';
      const hardPairBadge = pub.hardPair ? `<span class="badge-red">Hard Pair</span>` : '';
      card.innerHTML = `
        <div><h4 class="pub-name" style="margin:0 0 5px 0;">${genderIcon} ${pub.firstName} ${pub.lastName} ${hardPairBadge}</h4><p style="margin:0; font-size:0.85em; color:#666;">${partnerText}</p></div>
        <button onclick='editPublisher("${pub.id}")' style="width:auto; background:#5d7aa9; padding:5px 15px; margin:0;">Editar</button>
      `;
      listDiv.appendChild(card);
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName}</option>`;
    });
  } catch (error) { listDiv.innerHTML = '<p class="error">Error al cargar.</p>'; }
}

async function savePublisher() {
  const id = document.getElementById('pub-id').value;
  const firstName = document.getElementById('pub-firstname').value.trim();
  const lastName = document.getElementById('pub-lastname').value.trim();
  const gender = document.getElementById('pub-gender').value;
  const partnerId = document.getElementById('pub-partner').value;
  const hardPair = document.getElementById('pub-hardpair').checked;
  const username = document.getElementById('pub-username').value.trim();
  const password = document.getElementById('pub-password').value;
  const role = document.getElementById('pub-role').value;
  const usernameIsDisabled = document.getElementById('pub-username').disabled;
  const msgP = document.getElementById('pub-msg');
  const errorP = document.getElementById('pub-error');
  
  msgP.innerText = ''; errorP.innerText = '';
  if (!firstName || !lastName) { errorP.innerText = 'El nombre y apellido son obligatorios.'; return; }

  // Create the fake email format for Firebase Auth
  const email = username ? username.toLowerCase().replace(/\s+/g, '') + '@ppam.app' : '';

  let partnerName = "";
  if (partnerId) { const pObj = allPublishers.find(p => p.id === partnerId); if (pObj) partnerName = `${pObj.firstName} ${pObj.lastName}`; }
  const pubData = { firstName, lastName, gender, partner: partnerId, partnerName, hardPair };

  try {
    if (id) {
      await db.collection('publishers').doc(id).update(pubData);
      if (email && password && !usernameIsDisabled) {
        if (password.length < 6) { errorP.innerText = 'Contraseña requiere 6+ caracteres.'; setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 2500); return; }
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: id, role: role, username: username });
        await secondaryAuth.signOut();
      }
      msgP.innerText = 'Actualizado exitosamente.';
    } else {
      const newPubRef = await db.collection('publishers').add(pubData);
      if (email && password) {
        if (password.length < 6) { errorP.innerText = 'Contraseña requiere 6+ caracteres.'; setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 2500); return; }
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: newPubRef.id, role: role, username: username });
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
  
  const userQuery = await db.collection('users').where('publisherId', '==', id).get();
  if (!userQuery.empty) {
     const userData = userQuery.docs[0].data();
     document.getElementById('pub-username').value = userData.username || '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-username').disabled = true;
     document.getElementById('pub-password').disabled = true;
     document.getElementById('pub-role').value = userData.role || 'user';
     document.getElementById('pub-password').placeholder = "Cuenta vinculada";
     document.getElementById('account-status-msg').innerText = "✅ Este publicador ya tiene cuenta vinculada.";
  } else {
     document.getElementById('pub-username').value = '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-username').disabled = false;
     document.getElementById('pub-password').disabled = false;
     document.getElementById('pub-role').value = 'user';
     document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
     document.getElementById('account-status-msg').innerText = "⚠️ Sin cuenta. Puedes crearle una ahora.";
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePublisher() {
  const id = document.getElementById('pub-id').value;
  if (!id) return;
  if (!confirm('¿Estás seguro de eliminar este publicador?')) return;
  try {
    await db.collection('publishers').doc(id).delete();
    const userQuery = await db.collection('users').where('publisherId', '==', id).get();
    userQuery.forEach(async (doc) => { await db.collection('users').doc(doc.id).delete(); });
    clearPublisherForm(); loadPublishers();
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
  document.getElementById('pub-username').value = '';
  document.getElementById('pub-password').value = '';
  document.getElementById('pub-username').disabled = false;
  document.getElementById('pub-password').disabled = false;
  document.getElementById('pub-role').disabled = false;
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
  cards.forEach(c => { c.style.display = c.querySelector('.pub-name').innerText.toLowerCase().includes(input) ? 'flex' : 'none'; });
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
        <div><h4 style="margin:0 0 5px 0;">${loc.name} (Capacidad: ${loc.capacity})</h4><p style="margin:0; font-size:0.85em; color:#666;">Turnos: ${shiftsSummary || 'Ninguno'}</p></div>
        <button onclick='editLocation("${doc.id}")' style="width:auto; background:#5d7aa9; padding:5px 15px; margin:0;">Editar</button>
      `;
      listDiv.appendChild(card);
    });
  } catch (error) { listDiv.innerHTML = '<p class="error">Error al cargar ubicaciones.</p>'; }
}

function openLocationModal() {
  document.getElementById('location-modal').style.display = 'block';
  document.getElementById('loc-id').value = ''; document.getElementById('loc-name').value = ''; document.getElementById('loc-capacity').value = '2';
  document.getElementById('loc-modal-title').innerText = 'Nueva Ubicación';
  document.getElementById('btn-delete-loc').style.display = 'none';
  document.getElementById('shifts-container').innerHTML = `<button onclick="addShiftRow()" style="width:auto; background:#17a2b8; padding:5px 10px; font-size:0.9em; margin-bottom:10px;">+ Agregar Turno</button><div id="shifts-rows-wrapper"></div>`;
  addShiftRow(); 
}
function closeLocationModal() { document.getElementById('location-modal').style.display = 'none'; }

function addShiftRow(day = 'Lunes', start = '08:00', end = '10:00') {
  const container = document.getElementById('shifts-rows-wrapper') || document.getElementById('shifts-container');
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const row = document.createElement('div'); row.style.cssText = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
  row.className = 'shift-row';
  let options = days.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('');
  row.innerHTML = `<select class="shift-day" style="margin:0; flex:2;">${options}</select><input type="time" class="shift-start" value="${start}" style="margin:0; flex:1;"><input type="time" class="shift-end" value="${end}" style="margin:0; flex:1;"><button onclick="this.parentElement.remove()" style="margin:0; width:auto; background:#dc3545; padding:8px 12px;">X</button>`;
  container.appendChild(row);
}

async function saveLocation() {
  const id = document.getElementById('loc-id').value;
  const name = document.getElementById('loc-name').value.trim();
  const capacity = parseInt(document.getElementById('loc-capacity').value) || 2;
  if (!name) return;
  const templates = [];
  document.querySelectorAll('.shift-row').forEach(row => { templates.push({ day: row.querySelector('.shift-day').value, startTime: row.querySelector('.shift-start').value, endTime: row.querySelector('.shift-end').value }); });
  const locationData = { name, capacity, isActive: true, templates };
  try {
    if (id) await db.collection('locations').doc(id).update(locationData);
    else await db.collection('locations').add(locationData);
    closeLocationModal(); loadLocations();
  } catch (error) { alert('Error: ' + error.message); }
}

async function editLocation(id) {
  openLocationModal();
  document.getElementById('loc-modal-title').innerText = 'Editar Ubicación';
  document.getElementById('loc-id').value = id;
  document.getElementById('btn-delete-loc').style.display = 'inline-block';
  try {
    const doc = await db.collection('locations').doc(id).get();
    const loc = doc.data();
    document.getElementById('loc-name').value = loc.name; document.getElementById('loc-capacity').value = loc.capacity;
    document.getElementById('shifts-container').innerHTML = `<button onclick="addShiftRow()" style="width:auto; background:#17a2b8; padding:5px 10px; font-size:0.9em; margin-bottom:10px;">+ Agregar Turno</button><div id="shifts-rows-wrapper"></div>`;
    if (loc.templates && loc.templates.length > 0) loc.templates.forEach(t => addShiftRow(t.day, t.startTime, t.endTime));
    else addShiftRow();
  } catch (error) { alert('Error al cargar.'); }
}

async function deleteLocation() {
  const id = document.getElementById('loc-id').value;
  if (!confirm('¿Estás seguro de eliminar esta ubicación?')) return;
  await db.collection('locations').doc(id).delete();
  closeLocationModal(); loadLocations();
}

// ==========================================
// TAB 3: SCHEDULE GENERATOR 
// ==========================================
let draftSchedule = []; 

async function generateDraft() {
  const btn = document.querySelector('#tab-schedule button');
  btn.innerText = "Generando..."; btn.disabled = true;

  try {
    const monthVal = document.getElementById('gen-month').value; 
    const [targetYearStr, targetMonthStr] = monthVal.split('-');
    const targetYear = parseInt(targetYearStr);
    const targetMonthIndex = parseInt(targetMonthStr) - 1; 

    const pubsSnap = await db.collection('publishers').get();
    const locsSnap = await db.collection('locations').where('isActive', '==', true).get();

    const publishers = []; pubsSnap.forEach(d => { let p=d.data(); p.id=d.id; publishers.push(p); });
    const locations = []; locsSnap.forEach(d => { let l=d.data(); l.id=d.id; locations.push(l); });

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
              dateObj: dateObj, dateString: dateString, location: loc.name, time: `${t.startTime}-${t.endTime}`,
              capacity: loc.capacity, availKey: `${loc.name}_${t.day}_${t.startTime}`,
              pool: [], assigned: []
            });
          }
        });
      });
    }

    publishers.forEach(pub => {
      const avail = pub.availability || [];
      shiftTasks.forEach(task => { if (avail.includes(task.availKey)) task.pool.push(pub); });
    });

    shiftTasks.sort((a, b) => a.pool.length - b.pool.length);

    let assignedCounts = {}; let assignedDates = {};  

    function canAssign(pubId, dateObj, dateString) {
      let pub = publishers.find(p => p.id === pubId);
      // <--- NEW: Dynamic limits up to 5
      let limit = pub.maxShifts ? parseInt(pub.maxShifts) : 5;
      
      if ((assignedCounts[pubId] || 0) >= limit) return false; 
      if (assignedDates[pubId] && assignedDates[pubId].has(dateString)) return false; 
      let prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
      let nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);
      if (assignedDates[pubId] && (assignedDates[pubId].has(formatDate(prevDate)) || assignedDates[pubId].has(formatDate(nextDate)))) return false;
      return true;
    }

    shiftTasks.forEach(task => {
      task.pool.forEach(pub => {
        if (task.assigned.length >= task.capacity) return; 
        if (task.assigned.find(a => a.id === pub.id)) return; 
        if (!canAssign(pub.id, task.dateObj, task.dateString)) return; 

        if (pub.hardPair && pub.partner) {
          let partner = publishers.find(p => p.id === pub.partner);
          if (!partner) return;
          if (!task.pool.find(p => p.id === partner.id)) return; 
          if (!canAssign(partner.id, task.dateObj, task.dateString)) return; 

          if (task.assigned.length + 2 <= task.capacity) { 
            task.assigned.push(pub); task.assigned.push(partner);
            assignedCounts[pub.id] = (assignedCounts[pub.id] || 0) + 1;
            assignedCounts[partner.id] = (assignedCounts[partner.id] || 0) + 1;
            if(!assignedDates[pub.id]) assignedDates[pub.id] = new Set();
            if(!assignedDates[partner.id]) assignedDates[partner.id] = new Set();
            assignedDates[pub.id].add(task.dateString); assignedDates[partner.id].add(task.dateString);
          }
        } else if (!pub.hardPair) {
          task.assigned.push(pub);
          assignedCounts[pub.id] = (assignedCounts[pub.id] || 0) + 1;
          if(!assignedDates[pub.id]) assignedDates[pub.id] = new Set();
          assignedDates[pub.id].add(task.dateString);
        }
      });
    });

    draftSchedule = shiftTasks.sort((a,b) => a.dateObj - b.dateObj); 
    renderPreviewTable();

  } catch (error) { alert("Error al generar: " + error.message); } 
  finally { btn.innerText = "Generar Propuesta (Borrador)"; btn.disabled = false; }
}

function renderPreviewTable() {
  document.getElementById('schedule-preview-container').style.display = 'block';
  const tbody = document.getElementById('preview-body');
  document.getElementById('preview-head').innerHTML = `<tr><th>Fecha</th><th>Lugar</th><th>Horario</th><th>Asignados</th><th>Acción</th></tr>`;
  tbody.innerHTML = '';

  draftSchedule.forEach((shift, index) => {
    const names = shift.assigned.map(p => `${p.firstName} ${p.lastName}`).join(', ');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${shift.dateString}</td><td>${shift.location}</td><td>${shift.time}</td>
      <td style="color:${shift.assigned.length < shift.capacity ? '#dc3545' : '#28a745'}; font-weight:bold;">
        ${names || 'Nadie disponible'} (${shift.assigned.length}/${shift.capacity})
      </td>
      <td><button onclick="openShiftEditModal(${index})" style="background:#17a2b8; padding:5px 10px; margin:0; width:auto;">Editar</button></td>
    `;
    tbody.appendChild(row);
  });
}

function recalculateTrackers() {
  let counts = {}; let dates = {};
  draftSchedule.forEach(shift => {
    shift.assigned.forEach(pub => {
      counts[pub.id] = (counts[pub.id] || 0) + 1;
      if(!dates[pub.id]) dates[pub.id] = new Set();
      dates[pub.id].add(shift.dateString);
    });
  });
  return { counts, dates };
}

function openShiftEditModal(shiftIndex) {
  const shift = draftSchedule[shiftIndex];
  document.getElementById('shift-edit-modal').style.display = 'block';
  document.getElementById('shift-modal-title').innerText = `${shift.dateString} | ${shift.location} | ${shift.time}`;
  document.getElementById('shift-modal-count').innerText = `${shift.assigned.length}/${shift.capacity}`;
  
  const assignedContainer = document.getElementById('shift-modal-assigned');
  assignedContainer.innerHTML = '';
  shift.assigned.forEach(pub => {
    assignedContainer.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f1f1; padding:8px; border-radius:5px;">
        <span>${pub.firstName} ${pub.lastName}</span>
        <button onclick="manualRemove(${shiftIndex}, '${pub.id}')" style="margin:0; width:auto; background:#dc3545; padding:5px 10px;">Quitar</button>
      </div>`;
  });

  const select = document.getElementById('shift-add-select');
  let optionsHtml = `<option value="">Seleccionar publicador...</option>`;
  let availableHtml = `<optgroup label="✅ Disponibles">`;
  let unavailableHtml = `<optgroup label="⚠️ No Disponibles">`;
  
  const sortedPubs = [...allPublishers].sort((a,b) => a.firstName.localeCompare(b.firstName));
  
  sortedPubs.forEach(pub => {
    if(shift.assigned.find(p => p.id === pub.id)) return;
    const isAvailable = shift.pool.find(p => p.id === pub.id);
    if(isAvailable) { availableHtml += `<option value="${pub.id}">✅ ${pub.firstName} ${pub.lastName}</option>`; } 
    else { unavailableHtml += `<option value="${pub.id}">⚠️ ${pub.firstName} ${pub.lastName}</option>`; }
  });
  
  select.innerHTML = optionsHtml + availableHtml + `</optgroup>` + unavailableHtml + `</optgroup>`;
  document.getElementById('shift-add-btn').onclick = () => manualAdd(shiftIndex);
}

function closeShiftEditModal() { document.getElementById('shift-edit-modal').style.display = 'none'; }

function manualAdd(shiftIndex) {
  const pubId = document.getElementById('shift-add-select').value;
  if(!pubId) return;
  let shift = draftSchedule[shiftIndex];
  let pub = allPublishers.find(p => p.id === pubId);
  
  if(shift.assigned.length >= shift.capacity) {
      if(!confirm("⚠️ El turno ya alcanzó su capacidad. ¿Forzar adición?")) return;
  }

  let trackers = recalculateTrackers(); let warnings = [];
  let limit = pub.maxShifts ? parseInt(pub.maxShifts) : 5;
  if ((trackers.counts[pub.id] || 0) >= limit) warnings.push(`Ya tiene su límite de ${limit} turnos este mes.`);
  if (trackers.dates[pub.id] && trackers.dates[pub.id].has(shift.dateString)) warnings.push("Ya asignado a otro turno hoy.");
  
  let shiftDate = new Date(shift.dateObj);
  let prevDate = new Date(shiftDate); prevDate.setDate(prevDate.getDate() - 1);
  let nextDate = new Date(shiftDate); nextDate.setDate(nextDate.getDate() + 1);
  if (trackers.dates[pub.id] && (trackers.dates[pub.id].has(formatDate(prevDate)) || trackers.dates[pub.id].has(formatDate(nextDate)))) {
      warnings.push("Trabajará en un día consecutivo.");
  }

  if(warnings.length > 0) {
      if(!confirm(`⚠️ ADVERTENCIA: Reglas rotas para ${pub.firstName}\n` + warnings.map(w=>"- "+w).join("\n") + "\n\n¿Forzar asignación?")) return;
  }

  shift.assigned.push(pub);
  renderPreviewTable(); openShiftEditModal(shiftIndex); 
}

function manualRemove(shiftIndex, pubId) {
  let shift = draftSchedule[shiftIndex];
  let pub = shift.assigned.find(p => p.id === pubId);

  if(pub.hardPair && pub.partner && shift.assigned.find(p => p.id === pub.partner)) {
      if(!confirm(`⚠️ ADVERTENCIA: Separando Pareja Estricta. ¿Continuar?`)) return;
  }
  let partnerOf = shift.assigned.find(p => p.hardPair && p.partner === pubId);
  if(partnerOf) {
      if(!confirm(`⚠️ ADVERTENCIA: Quitando a la pareja de ${partnerOf.firstName}. ¿Continuar?`)) return;
  }

  shift.assigned = shift.assigned.filter(p => p.id !== pubId);
  renderPreviewTable(); openShiftEditModal(shiftIndex); 
}

async function publishSchedule() {
  if (draftSchedule.length === 0) return;
  if (!confirm('¿Estás seguro de publicar este mes?')) return;
  const btn = document.querySelector('#schedule-preview-container button');
  btn.innerText = "Publicando..."; btn.disabled = true;

  try {
    for (const shift of draftSchedule) {
      await db.collection('shifts').add({
        date: shift.dateString, location: shift.location, time: shift.time, capacity: shift.capacity,
        participants: shift.assigned.map(p => p.id) 
      });
    }
    alert('¡Programa publicado con éxito!');
    document.getElementById('schedule-preview-container').style.display = 'none';
    draftSchedule = []; 
  } catch (error) { alert("Error: " + error.message); } 
  finally { btn.innerText = "Publicar Programa"; btn.disabled = false; }
}
