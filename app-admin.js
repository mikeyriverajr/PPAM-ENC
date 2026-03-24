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

// ==========================================
// POPUPS & FORMATTERS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'check_circle'; let iconColor = '#28a745';
    if (type === 'error') { icon = 'cancel'; iconColor = '#dc3545'; }
    else if (type === 'info') { icon = 'info'; iconColor = '#17a2b8'; }
    toast.innerHTML = `<span class="material-symbols-outlined" style="color: ${iconColor}; font-size: 24px;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'fadeOutToast 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showConfirm(message, okText = "Aceptar", okColor = "#dc3545") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm');
        const msgEl = document.getElementById('confirm-msg');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnOk = document.getElementById('btn-confirm-ok');
        msgEl.innerText = message; btnOk.innerText = okText; btnOk.style.background = okColor;
        modal.style.display = 'flex';
        const cleanup = () => { modal.style.display = 'none'; btnCancel.onclick = null; btnOk.onclick = null; };
        btnCancel.onclick = () => { cleanup(); resolve(false); };
        btnOk.onclick = () => { cleanup(); resolve(true); };
    });
}

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function formatSpanishDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr; 
    const y = parseInt(parts[0]); const m = parseInt(parts[1]) - 1; const d = parseInt(parts[2]);
    const dateObj = new Date(y, m, d);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${days[dateObj.getDay()]} ${d} de ${months[dateObj.getMonth()]}`;
}

// ==========================================
// GATEKEEPER 
// ==========================================
auth.onAuthStateChanged(async user => {
  if (user) {
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      const isDbAdmin = userDoc.exists && userDoc.data().role === 'admin';
      const isOriginalAdmin = !user.email.endsWith('@ppam.app'); 

      if (isDbAdmin || isOriginalAdmin) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        if(isDbAdmin) {
             const pubDoc = await db.collection('publishers').doc(userDoc.data().publisherId).get();
             if(pubDoc.exists) document.getElementById('admin-header-name').innerText = `| Conectado: ${pubDoc.data().firstName}`;
        } else {
             document.getElementById('admin-header-name').innerText = `| Conectado: ${user.email}`;
        }
        loadPublishers(); 
      } else {
        auth.signOut();
        document.getElementById('login-error').innerText = "Acceso Denegado: Esta cuenta no tiene permisos de Administrador.";
      }
    } catch (e) { console.error(e); auth.signOut(); }
  } else {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
  }
});

function adminLogin() {
  let input = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const errorDiv = document.getElementById('login-error');
  errorDiv.innerText = "";
  let email = input;
  if (!input.includes('@')) { email = input.toLowerCase().replace(/\s+/g, '') + '@ppam.app'; }
  auth.signInWithEmailAndPassword(email, pass).catch(e => { errorDiv.innerText = "Error: Verifica tu usuario o contraseña."; });
}
function logout() { auth.signOut(); }

function switchAdminTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-btn-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  if (tabId === 'locations') loadLocations();
  if (tabId === 'users') loadPublishers();
  if (tabId === 'schedule') checkMonthStatus(); 
}

// ==========================================
// TAB 1: DIRECTORIO (UPGRADED)
// ==========================================
let allPublishers = []; 
let currentLinkedUserDocId = null; 
let currentAbsences = [];

document.addEventListener("DOMContentLoaded", function() {
    const partnerSelect = document.getElementById('pub-partner');
    if(partnerSelect) {
        partnerSelect.addEventListener('change', function() {
            document.getElementById('pub-hardpair-container').style.display = this.value ? 'flex' : 'none';
            if(!this.value) document.getElementById('pub-hardpair').checked = false;
        });
    }
});

async function loadPublishers() {
  const listDiv = document.getElementById('publishers-list');
  const partnerSelect = document.getElementById('pub-partner');
  listDiv.innerHTML = '<p style="color:#666; text-align:center;">Cargando directorio...</p>';
  try {
    const snapshot = await db.collection('publishers').orderBy('firstName').get();
    allPublishers = [];
    partnerSelect.innerHTML = '<option value="">Ninguno</option>';
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666; text-align:center;">No hay publicadores registrados.</p>'; return; }
    listDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const pub = doc.data(); pub.id = doc.id; allPublishers.push(pub);
      const card = document.createElement('div');
      card.className = 'pub-card';
      const genderIcon = pub.gender === 'M' ? 'woman' : 'man';
      const statusBadge = pub.status === 'Entrenamiento' ? `<span class="badge-warning">Entrenamiento</span>` : '';
      const hardPairBadge = pub.hardPair ? `<span class="badge-red">Estricto</span>` : '';
      card.innerHTML = `
        <div><h4 class="pub-name" style="margin:0 0 5px 0; display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="color:#5d7aa9;">${genderIcon}</span> ${pub.firstName} ${pub.lastName} ${statusBadge} ${hardPairBadge}</h4>
        <p style="margin:0; font-size:0.85em; color:#666; margin-left: 30px;">Turnos al mes: ${pub.maxShifts || '5'} | Compañero: ${pub.partnerName || 'Ninguno'}</p></div>
        <button onclick='editPublisher("${pub.id}")' class="btn-action btn-primary">Editar</button>
      `;
      listDiv.appendChild(card);
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName}</option>`;
    });
  } catch (error) { listDiv.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar.</p>'; }
}

async function buildAdminAvailabilityForm(pubAvailability = []) {
  const container = document.getElementById('admin-avail-container');
  try {
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const grouped = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };
    locSnapshot.forEach(doc => {
      const loc = doc.data();
      (loc.templates || []).forEach(t => {
        if (grouped[t.day] !== undefined) grouped[t.day].push({ name: loc.name, time: `${t.startTime}-${t.endTime}`, val: `${loc.name}_${t.day}_${t.startTime}` });
      });
    });
    container.innerHTML = '';
    let hasShifts = false;
    daysOrder.forEach(day => {
      if (grouped[day].length > 0) {
        hasShifts = true; grouped[day].sort((a, b) => a.time.localeCompare(b.time));
        const div = document.createElement('div'); div.className = 'admin-avail-day';
        let html = `<h5>${day}</h5>`;
        grouped[day].forEach(s => {
          const isChecked = pubAvailability.includes(s.val) ? 'checked' : '';
          html += `<div class="admin-avail-check"><input type="checkbox" id="admin-chk-${s.val}" class="admin-avail-checkbox" value="${s.val}" ${isChecked}><label for="admin-chk-${s.val}">${s.name} (${s.time})</label></div>`;
        });
        div.innerHTML = html; container.appendChild(div);
      }
    });
    if (!hasShifts) container.innerHTML = '<p style="text-align:center; color:#666; font-size:0.85em;">No hay ubicaciones activas en el sistema.</p>';
  } catch (error) { container.innerHTML = '<p style="color:red; font-size:0.8em;">Error al cargar turnos.</p>'; }
}

function renderAbsences() {
    const list = document.getElementById('absences-list');
    list.innerHTML = '';
    currentAbsences.forEach((abs, index) => {
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:8px; border-radius:4px; font-size:0.9em;">
            <span>📅 ${formatSpanishDate(abs.start)} - ${formatSpanishDate(abs.end)}</span>
            <button onclick="removeAbsence(${index})" class="btn-action btn-danger" style="padding:4px;"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
        </div>`;
    });
}
function addAbsence() {
    const s = document.getElementById('abs-start').value; const e = document.getElementById('abs-end').value;
    if(!s || !e) { showToast("Selecciona fecha de inicio y fin.", "error"); return; }
    if(s > e) { showToast("La fecha de fin no puede ser anterior al inicio.", "error"); return; }
    currentAbsences.push({start: s, end: e});
    document.getElementById('abs-start').value = ''; document.getElementById('abs-end').value = '';
    renderAbsences();
}
function removeAbsence(index) { currentAbsences.splice(index, 1); renderAbsences(); }

async function editPublisher(id) {
  const pub = allPublishers.find(p => p.id === id);
  if (!pub) return;
  document.getElementById('pub-form-title').innerText = 'Editar Publicador';
  document.getElementById('pub-id').value = pub.id;
  document.getElementById('pub-firstname').value = pub.firstName || '';
  document.getElementById('pub-lastname').value = pub.lastName || '';
  document.getElementById('pub-gender').value = pub.gender || 'H';
  document.getElementById('pub-status').value = pub.status || 'Aprobado';
  document.getElementById('pub-max').value = pub.maxShifts || '5';
  document.getElementById('pub-partner').value = pub.partner || '';
  document.getElementById('pub-hardpair-container').style.display = pub.partner ? 'flex' : 'none';
  document.getElementById('pub-hardpair').checked = pub.hardPair || false;
  
  // Contacts
  document.getElementById('pub-phone').value = pub.phone || '';
  document.getElementById('pub-email').value = pub.notificationEmail || '';
  document.getElementById('pub-emerg-name').value = pub.emergencyName || '';
  document.getElementById('pub-emerg-phone').value = pub.emergencyPhone || '';

  // Availability & Absences
  buildAdminAvailabilityForm(pub.availability || []);
  currentAbsences = pub.absences || [];
  renderAbsences();

  document.getElementById('btn-cancel-pub').style.display = 'block';
  document.getElementById('btn-delete-pub').style.display = 'inline-flex';
  
  const userQuery = await db.collection('users').where('publisherId', '==', id).get();
  if (!userQuery.empty) {
     const userDoc = userQuery.docs[0];
     currentLinkedUserDocId = userDoc.id;
     const userData = userDoc.data();
     document.getElementById('pub-username').value = userData.username || '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-username').disabled = true;
     document.getElementById('pub-password').disabled = true;
     document.getElementById('pub-role').value = userData.role || 'user';
     document.getElementById('pub-password').placeholder = "Cuenta vinculada";
     document.getElementById('account-status-msg').innerText = "✅ Este publicador ya tiene cuenta vinculada.";
     document.getElementById('btn-unlink').style.display = 'inline-flex';
  } else {
     currentLinkedUserDocId = null;
     document.getElementById('pub-username').value = '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-username').disabled = false;
     document.getElementById('pub-password').disabled = false;
     document.getElementById('pub-role').value = 'user';
     document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
     document.getElementById('account-status-msg').innerText = "Opcional al crear un usuario nuevo.";
     document.getElementById('btn-unlink').style.display = 'none';
  }
}

async function savePublisher() {
  const id = document.getElementById('pub-id').value;
  const firstName = document.getElementById('pub-firstname').value.trim();
  const lastName = document.getElementById('pub-lastname').value.trim();
  const gender = document.getElementById('pub-gender').value;
  const partnerId = document.getElementById('pub-partner').value;
  const hardPair = document.getElementById('pub-hardpair').checked;
  const status = document.getElementById('pub-status').value;
  const maxShifts = parseInt(document.getElementById('pub-max').value) || 5;
  const phone = document.getElementById('pub-phone').value.trim();
  const notificationEmail = document.getElementById('pub-email').value.trim();
  const emergencyName = document.getElementById('pub-emerg-name').value.trim();
  const emergencyPhone = document.getElementById('pub-emerg-phone').value.trim();
  const availability = Array.from(document.querySelectorAll('.admin-avail-checkbox:checked')).map(cb => cb.value);

  const username = document.getElementById('pub-username').value.trim();
  const password = document.getElementById('pub-password').value;
  const role = document.getElementById('pub-role').value;
  const usernameIsDisabled = document.getElementById('pub-username').disabled;
  
  if (!firstName || !lastName) { showToast('El nombre y apellido son obligatorios.', 'error'); return; }

  const email = username ? username.toLowerCase().replace(/\s+/g, '') + '@ppam.app' : '';
  let partnerName = "";
  if (partnerId) { const pObj = allPublishers.find(p => p.id === partnerId); if (pObj) partnerName = `${pObj.firstName} ${pObj.lastName}`; }
  
  const pubData = { firstName, lastName, gender, status, partner: partnerId, partnerName, hardPair, maxShifts, phone, notificationEmail, emergencyName, emergencyPhone, availability, absences: currentAbsences };

  try {
    if (id) {
      await db.collection('publishers').doc(id).update(pubData);
      if (email && password && !usernameIsDisabled) {
        if (password.length < 6) { showToast('Contraseña requiere 6+ caracteres.', 'error'); return; }
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: id, role: role, username: username, requirePasswordChange: true });
        await secondaryAuth.signOut();
      } else if (currentLinkedUserDocId) {
        await db.collection('users').doc(currentLinkedUserDocId).update({ role: role });
      }
      showToast('Publicador actualizado exitosamente.');
    } else {
      const newPubRef = await db.collection('publishers').add(pubData);
      if (email && password) {
        if (password.length < 6) { showToast('Contraseña requiere 6+ caracteres.', 'error'); return; }
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({ publisherId: newPubRef.id, role: role, username: username, requirePasswordChange: true });
        await secondaryAuth.signOut();
      }
      showToast('Publicador creado exitosamente.');
    }
    setTimeout(() => { clearPublisherForm(); loadPublishers(); }, 1000);
  } catch (error) { showToast('Error: ' + error.message, 'error'); }
}

async function unlinkAccount() {
  if (!currentLinkedUserDocId) return;
  const isConfirmed = await showConfirm("¿Estás seguro de desvincular esta cuenta? Esto borrará su acceso actual.", "Sí, Desvincular");
  if (!isConfirmed) return;
  try {
      await db.collection('users').doc(currentLinkedUserDocId).delete();
      showToast("Cuenta desvínculada. Asigna nuevos datos y haz clic en Guardar.", "info");
      currentLinkedUserDocId = null;
      document.getElementById('pub-username').disabled = false;
      document.getElementById('pub-password').disabled = false;
      document.getElementById('pub-username').value = document.getElementById('pub-username').value + '2'; 
      document.getElementById('pub-password').placeholder = "Ingresa contraseña temporal";
      document.getElementById('account-status-msg').innerText = "⚠️ Cuenta desvinculada. Crea los nuevos datos de acceso.";
      document.getElementById('btn-unlink').style.display = 'none';
  } catch(e) { showToast("Error al desvincular.", "error"); }
}

async function deletePublisher() {
  const id = document.getElementById('pub-id').value;
  if (!id) return;
  const isConfirmed = await showConfirm("¿Estás seguro de eliminar este publicador de la congregación?", "Eliminar Publicador");
  if (!isConfirmed) return;
  try {
    await db.collection('publishers').doc(id).delete();
    const userQuery = await db.collection('users').where('publisherId', '==', id).get();
    userQuery.forEach(async (doc) => { await db.collection('users').doc(doc.id).delete(); });
    showToast("Publicador eliminado.");
    clearPublisherForm(); loadPublishers();
  } catch (error) { showToast("Error: " + error.message, "error"); }
}

function clearPublisherForm() {
  document.getElementById('pub-form-title').innerText = 'Nuevo Publicador';
  document.getElementById('pub-id').value = '';
  document.getElementById('pub-firstname').value = '';
  document.getElementById('pub-lastname').value = '';
  document.getElementById('pub-gender').value = 'H';
  document.getElementById('pub-status').value = 'Aprobado';
  document.getElementById('pub-max').value = '5';
  document.getElementById('pub-partner').value = '';
  document.getElementById('pub-hardpair-container').style.display = 'none';
  document.getElementById('pub-hardpair').checked = false;
  document.getElementById('pub-phone').value = '';
  document.getElementById('pub-email').value = '';
  document.getElementById('pub-emerg-name').value = '';
  document.getElementById('pub-emerg-phone').value = '';
  document.getElementById('pub-username').value = '';
  document.getElementById('pub-password').value = '';
  document.getElementById('pub-username').disabled = false;
  document.getElementById('pub-password').disabled = false;
  document.getElementById('pub-role').disabled = false;
  document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
  document.getElementById('btn-cancel-pub').style.display = 'none';
  document.getElementById('btn-delete-pub').style.display = 'none';
  document.getElementById('btn-unlink').style.display = 'none';
  currentLinkedUserDocId = null;
  currentAbsences = [];
  renderAbsences();
  document.getElementById('admin-avail-container').innerHTML = '<p style="text-align:center; font-size:0.9em; color:#666;">Selecciona o crea un publicador para editar su rutina.</p>';
  document.getElementById('account-status-msg').innerText = "Opcional al crear un usuario nuevo.";
}

function filterPublishers() {
  const input = document.getElementById('pub-search').value.toLowerCase();
  const cards = document.querySelectorAll('.pub-card');
  cards.forEach(c => { c.style.display = c.querySelector('.pub-name').innerText.toLowerCase().includes(input) ? 'flex' : 'none'; });
}

// ==========================================
// TAB 2: LOCATIONS (QUICK BUILDER & STATUS)
// ==========================================
async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p style="color:#666; text-align:center;">Cargando ubicaciones...</p>';
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666; text-align:center;">No hay ubicaciones registradas.</p>'; return; }
    listDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const loc = doc.data();
      const card = document.createElement('div');
      card.className = 'pub-card';
      const shiftsSummary = (loc.templates || []).map(t => `${t.day} ${t.startTime}-${t.endTime}`).join(', ');
      const statusBadge = loc.isActive !== false ? '<span class="badge-green">Activa</span>' : '<span class="badge-gray">Inactiva</span>';
      card.innerHTML = `
        <div><h4 style="margin:0 0 5px 0; display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="color:#dc3545;">location_on</span> ${loc.name} <span style="font-size:0.8em; color:#666; font-weight:normal;">(Cap: ${loc.capacity})</span> ${statusBadge}</h4>
        <p style="margin:0; font-size:0.85em; color:#666; margin-left: 30px;">Turnos: ${shiftsSummary || 'Ninguno'}</p></div>
        <button onclick='editLocation("${doc.id}")' class="btn-action btn-primary">Editar</button>
      `;
      listDiv.appendChild(card);
    });
  } catch (error) { listDiv.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar ubicaciones.</p>'; }
}

function openLocationModal() {
  document.getElementById('location-modal').style.display = 'flex';
  document.getElementById('loc-id').value = ''; document.getElementById('loc-name').value = ''; 
  document.getElementById('loc-capacity').value = '2'; document.getElementById('loc-status').value = 'true';
  document.getElementById('loc-modal-title').innerText = 'Nueva Ubicación';
  document.getElementById('btn-delete-loc').style.display = 'none';
  document.getElementById('shifts-container').innerHTML = '';
}
function closeLocationModal() { document.getElementById('location-modal').style.display = 'none'; }

function executeQuickBuild() {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const startStr = document.getElementById('qb-start').value;
    const endStr = document.getElementById('qb-end').value;
    const durHours = parseInt(document.getElementById('qb-duration').value);
    
    if(!startStr || !endStr || !durHours) { showToast("Completa los datos del generador rápido.", "error"); return; }
    
    const selectedDays = days.filter(d => document.getElementById('qb-' + d).checked);
    if(selectedDays.length === 0) { showToast("Selecciona al menos un día.", "error"); return; }
    
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    let startMinTotal = startH * 60 + startM;
    const endMinTotal = endH * 60 + endM;
    const durMins = durHours * 60;
    
    let generatedCount = 0;
    selectedDays.forEach(day => {
        let currentMins = startMinTotal;
        while(currentMins + durMins <= endMinTotal) {
            const sh = String(Math.floor(currentMins / 60)).padStart(2, '0');
            const sm = String(currentMins % 60).padStart(2, '0');
            const eh = String(Math.floor((currentMins + durMins) / 60)).padStart(2, '0');
            const em = String((currentMins + durMins) % 60).padStart(2, '0');
            addShiftRow(day, `${sh}:${sm}`, `${eh}:${em}`);
            currentMins += durMins;
            generatedCount++;
        }
    });
    showToast(`Se agregaron ${generatedCount} turnos a la lista.`);
}

function addShiftRow(day = 'Lunes', start = '08:00', end = '10:00') {
  const container = document.getElementById('shifts-container');
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const row = document.createElement('div'); row.style.cssText = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
  row.className = 'shift-row';
  let options = days.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('');
  row.innerHTML = `<select class="shift-day form-group" style="margin:0; flex:2; padding:10px;">${options}</select><input type="time" class="shift-start form-group" value="${start}" style="margin:0; flex:1; padding:10px;"><input type="time" class="shift-end form-group" value="${end}" style="margin:0; flex:1; padding:10px;"><button onclick="this.parentElement.remove()" class="btn-action btn-danger" style="margin:0; padding:10px;"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>`;
  container.appendChild(row);
}

async function saveLocation() {
  const id = document.getElementById('loc-id').value;
  const name = document.getElementById('loc-name').value.trim();
  const capacity = parseInt(document.getElementById('loc-capacity').value) || 2;
  const isActive = document.getElementById('loc-status').value === 'true';
  if (!name) { showToast("El nombre es obligatorio", "error"); return; }
  
  const templates = [];
  document.querySelectorAll('.shift-row').forEach(row => { templates.push({ day: row.querySelector('.shift-day').value, startTime: row.querySelector('.shift-start').value, endTime: row.querySelector('.shift-end').value }); });
  
  const locationData = { name, capacity, isActive, templates };
  try {
    if (id) await db.collection('locations').doc(id).update(locationData);
    else await db.collection('locations').add(locationData);
    showToast("Ubicación guardada.");
    closeLocationModal(); loadLocations();
  } catch (error) { showToast('Error: ' + error.message, "error"); }
}

async function editLocation(id) {
  openLocationModal();
  document.getElementById('loc-modal-title').innerText = 'Editar Ubicación';
  document.getElementById('loc-id').value = id;
  document.getElementById('btn-delete-loc').style.display = 'inline-flex';
  try {
    const doc = await db.collection('locations').doc(id).get();
    const loc = doc.data();
    document.getElementById('loc-name').value = loc.name; 
    document.getElementById('loc-capacity').value = loc.capacity;
    document.getElementById('loc-status').value = loc.isActive !== false ? 'true' : 'false';
    if (loc.templates && loc.templates.length > 0) loc.templates.forEach(t => addShiftRow(t.day, t.startTime, t.endTime));
  } catch (error) { showToast('Error al cargar ubicación.', "error"); }
}

async function deleteLocation() {
  const id = document.getElementById('loc-id').value;
  const isConfirmed = await showConfirm("¿Estás seguro de eliminar esta ubicación y sus turnos de plantilla?", "Eliminar Ubicación");
  if (!isConfirmed) return;
  await db.collection('locations').doc(id).delete();
  showToast("Ubicación eliminada.");
  closeLocationModal(); loadLocations();
}

// ==========================================
// TAB 3: GENERATOR (WITH ABSENCE/TRAINEE LOGIC)
// ==========================================
let draftSchedule = []; 

async function checkMonthStatus() {
    const monthVal = document.getElementById('gen-month').value;
    const btnGen = document.getElementById('btn-gen-draft');
    const btnLoad = document.getElementById('btn-load-month');
    const containerDel = document.getElementById('container-delete-month');
    document.getElementById('schedule-preview-container').style.display = 'none';

    try {
        const snap = await db.collection('shifts').where('date', '>=', `${monthVal}-01`).where('date', '<=', `${monthVal}-31`).limit(1).get();
        if (!snap.empty) { btnGen.style.display = 'none'; btnLoad.style.display = 'inline-flex'; containerDel.style.display = 'block';
        } else { btnGen.style.display = 'inline-flex'; btnLoad.style.display = 'none'; containerDel.style.display = 'none'; }
    } catch(e) { console.error("Error:", e); }
}

async function generateDraft() {
  const btn = document.getElementById('btn-gen-draft');
  btn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> Calculando...`; btn.disabled = true;

  try {
    const monthVal = document.getElementById('gen-month').value; 
    const [targetYearStr, targetMonthStr] = monthVal.split('-');
    const targetYear = parseInt(targetYearStr);
    const targetMonthIndex = parseInt(targetMonthStr) - 1; 

    // FEATURE 2: ONLY PULL ACTIVE LOCATIONS
    const locsSnap = await db.collection('locations').where('isActive', '==', true).get();
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
              docId: null, dateObj: dateObj, dateString: dateString, location: loc.name, time: `${t.startTime}-${t.endTime}`,
              capacity: loc.capacity, availKey: `${loc.name}_${t.day}_${t.startTime}`, pool: [], assigned: []
            });
          }
        });
      });
    }

    // Assigning Pools
    allPublishers.forEach(pub => {
      const avail = pub.availability || [];
      shiftTasks.forEach(task => { if (avail.includes(task.availKey)) task.pool.push(pub); });
    });

    shiftTasks.sort((a, b) => a.pool.length - b.pool.length);

    let assignedCounts = {}; let assignedDates = {};  

    function isAbsent(pub, dateString) {
        if (!pub.absences) return false;
        return pub.absences.some(abs => dateString >= abs.start && dateString <= abs.end);
    }

    function canAssign(pubId, dateObj, dateString) {
      let pub = allPublishers.find(p => p.id === pubId);
      
      // FEATURE 3 & 5: Skip Trainees and Vacations entirely during auto-gen!
      if (pub.status === 'Entrenamiento') return false;
      if (isAbsent(pub, dateString)) return false;
      
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
          let partner = allPublishers.find(p => p.id === pub.partner);
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
    showToast("Borrador generado. Revisa y haz clic en Guardar.");

  } catch (error) { showToast("Error al generar: " + error.message, "error"); } 
  finally { btn.innerHTML = `<span class="material-symbols-outlined">magic_button</span> 1. Generar Borrador Nuevo`; btn.disabled = false; }
}

async function loadPublishedMonth() {
  const monthVal = document.getElementById('gen-month').value; 
  const startDate = `${monthVal}-01`;
  const endDate = `${monthVal}-31`;

  try {
    const shiftsSnap = await db.collection('shifts').where('date', '>=', startDate).where('date', '<=', endDate).get();
    if (shiftsSnap.empty) { showToast("No hay turnos publicados para este mes.", "info"); return; }
    draftSchedule = [];
    
    shiftsSnap.forEach(doc => {
        const s = doc.data();
        let assignedPubs = [];
        (s.participants || []).forEach(pubId => {
            let pubObj = allPublishers.find(p => p.id === pubId);
            if (pubObj) assignedPubs.push(pubObj);
        });
        const [y, m, d] = s.date.split('-');
        const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
        const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dateObj.getDay()];
        const availKey = `${s.location}_${dayName}_${s.time.split('-')[0]}`;
        let taskPool = [];
        allPublishers.forEach(pub => { if ((pub.availability || []).includes(availKey)) taskPool.push(pub); });
        draftSchedule.push({
            docId: doc.id, dateObj: dateObj, dateString: s.date, location: s.location, time: s.time,
            capacity: s.capacity || 2, availKey: availKey, pool: taskPool, assigned: assignedPubs
        });
    });
    draftSchedule.sort((a,b) => a.dateObj - b.dateObj);
    renderPreviewTable();
    showToast("Mes cargado correctamente.");
  } catch (error) { showToast("Error al cargar: " + error.message, "error"); }
}

async function deletePublishedMonth() {
  const monthVal = document.getElementById('gen-month').value; 
  const isConfirmed = await showConfirm(`⚠️ PELIGRO: Estás a punto de ELIMINAR todo el mes de ${monthVal}.\n\nEsta acción no se puede deshacer y todos perderán sus asignaciones. ¿Eliminar mes?`, "Eliminar Todo el Mes", "#dc3545");
  if (!isConfirmed) return;

  try {
      const shiftsSnap = await db.collection('shifts').where('date', '>=', `${monthVal}-01`).where('date', '<=', `${monthVal}-31`).get();
      if (shiftsSnap.empty) { showToast("No hay turnos para eliminar en este mes.", "info"); return; }
      
      const batch = db.batch();
      shiftsSnap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      showToast("Mes eliminado con éxito.");
      document.getElementById('schedule-preview-container').style.display = 'none';
      draftSchedule = []; checkMonthStatus(); 
  } catch(e) { showToast("Error al eliminar: " + e.message, "error"); }
}

function renderPreviewTable() {
  document.getElementById('schedule-preview-container').style.display = 'block';
  const tbody = document.getElementById('preview-body');
  document.getElementById('preview-head').innerHTML = `<tr><th>Fecha</th><th>Lugar / Hora</th><th>Asignados</th><th>Acción</th></tr>`;
  tbody.innerHTML = '';
  
  draftSchedule.forEach((shift, index) => {
    let namesHtml = '';
    shift.assigned.forEach(p => {
        const warn = p.status === 'Entrenamiento' ? `<span class="material-symbols-outlined" style="font-size:14px; color:#ffc107; vertical-align:-2px;" title="En Entrenamiento">warning</span>` : '';
        namesHtml += `${p.firstName} ${p.lastName} ${warn}, `;
    });
    namesHtml = namesHtml.slice(0, -2); // remove last comma
    
    const row = document.createElement('tr');
    const isFull = shift.assigned.length >= shift.capacity;
    const statusColor = isFull ? '#28a745' : '#dc3545';
    
    row.innerHTML = `
      <td style="text-transform: capitalize; font-weight: 500; min-width: 140px;">${formatSpanishDate(shift.dateString)}</td>
      <td><strong>${shift.location}</strong><br><span style="color:#666; font-size:0.9em;">${shift.time}</span></td>
      <td style="color:${statusColor};">
        ${namesHtml || 'Nadie disponible'} <br>
        <span style="font-size:0.85em; opacity: 0.8;">(${shift.assigned.length}/${shift.capacity})</span>
      </td>
      <td style="width: 100px; text-align: right;"><button onclick="openShiftEditModal(${index})" class="btn-action btn-info"><span class="material-symbols-outlined" style="font-size:18px;">edit</span> Editar</button></td>
    `;
    tbody.appendChild(row);
  });
}

function recalculateTrackers() {
  let counts = {}; let dates = {};
  draftSchedule.forEach(shift => {
    shift.assigned.forEach(pub => { counts[pub.id] = (counts[pub.id] || 0) + 1; if(!dates[pub.id]) dates[pub.id] = new Set(); dates[pub.id].add(shift.dateString); });
  }); return { counts, dates };
}

function openShiftEditModal(shiftIndex) {
  const shift = draftSchedule[shiftIndex];
  document.getElementById('shift-edit-modal').style.display = 'flex';
  document.getElementById('shift-modal-title').innerText = `${formatSpanishDate(shift.dateString)} | ${shift.time}`;
  document.getElementById('shift-modal-count').innerText = `${shift.assigned.length}/${shift.capacity}`;
  
  const assignedContainer = document.getElementById('shift-modal-assigned');
  assignedContainer.innerHTML = '';
  shift.assigned.forEach(pub => {
    const warn = pub.status === 'Entrenamiento' ? `<span class="badge-warning">Trainee</span>` : '';
    assignedContainer.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:12px; border-radius:8px; border:1px solid #eee;"><span>${pub.firstName} ${pub.lastName} ${warn}</span><button onclick="manualRemove(${shiftIndex}, '${pub.id}')" class="btn-action btn-danger" style="padding:6px 12px;">Quitar</button></div>`;
  });
  
  const select = document.getElementById('shift-add-select');
  let optionsHtml = `<option value="">Seleccionar publicador...</option>`;
  let availableHtml = `<optgroup label="✅ Disponibles (Aprobados)">`; 
  let traineeHtml = `<optgroup label="⚠️ En Entrenamiento (Asignar Manualmente)">`; 
  let unavailableHtml = `<optgroup label="❌ No Disponibles / Ausentes">`;
  
  const sortedPubs = [...allPublishers].sort((a,b) => a.firstName.localeCompare(b.firstName));
  sortedPubs.forEach(pub => {
    if(shift.assigned.find(p => p.id === pub.id)) return;
    
    // Check if they are absent on this specific day
    let isAway = false;
    if(pub.absences) { isAway = pub.absences.some(abs => shift.dateString >= abs.start && shift.dateString <= abs.end); }

    if (isAway) {
        unavailableHtml += `<option value="${pub.id}">✈️ ${pub.firstName} ${pub.lastName} (Vacaciones)</option>`;
    } else if (pub.status === 'Entrenamiento') {
        traineeHtml += `<option value="${pub.id}">⚠️ ${pub.firstName} ${pub.lastName}</option>`;
    } else if(shift.pool.find(p => p.id === pub.id)) { 
        availableHtml += `<option value="${pub.id}">✅ ${pub.firstName} ${pub.lastName}</option>`; 
    } else { 
        unavailableHtml += `<option value="${pub.id}">❌ ${pub.firstName} ${pub.lastName}</option>`; 
    }
  });
  select.innerHTML = optionsHtml + availableHtml + `</optgroup>` + traineeHtml + `</optgroup>` + unavailableHtml + `</optgroup>`;
  document.getElementById('shift-add-btn').onclick = () => manualAdd(shiftIndex);
}

function closeShiftEditModal() { document.getElementById('shift-edit-modal').style.display = 'none'; }

async function manualAdd(shiftIndex) {
  const pubId = document.getElementById('shift-add-select').value;
  if(!pubId) return;
  let shift = draftSchedule[shiftIndex]; let pub = allPublishers.find(p => p.id === pubId);
  
  if(shift.assigned.length >= shift.capacity) { 
      const force = await showConfirm("⚠️ El turno ya alcanzó su capacidad máxima. ¿Forzar adición?", "Forzar");
      if(!force) return; 
  }
  
  let trackers = recalculateTrackers(); let warnings = [];
  
  if (pub.status === 'Entrenamiento') warnings.push("Está En Entrenamiento. Asegúrate de asignarlo con un capacitador.");
  if (pub.absences && pub.absences.some(abs => shift.dateString >= abs.start && shift.dateString <= abs.end)) warnings.push("✈️ Está marcado como AUSENTE (Vacaciones) en esta fecha.");

  let limit = pub.maxShifts ? parseInt(pub.maxShifts) : 5;
  if ((trackers.counts[pub.id] || 0) >= limit) warnings.push(`Ya tiene límite de ${limit} turnos.`);
  if (trackers.dates[pub.id] && trackers.dates[pub.id].has(shift.dateString)) warnings.push("Ya asignado hoy.");
  
  let shiftDate = new Date(shift.dateObj); let prevDate = new Date(shiftDate); prevDate.setDate(prevDate.getDate() - 1); let nextDate = new Date(shiftDate); nextDate.setDate(nextDate.getDate() + 1);
  if (trackers.dates[pub.id] && (trackers.dates[pub.id].has(formatDate(prevDate)) || trackers.dates[pub.id].has(formatDate(nextDate)))) { warnings.push("Trabajará día consecutivo."); }
  
  if(warnings.length > 0) { 
      const forceWarn = await showConfirm(`⚠️ ADVERTENCIA:\n` + warnings.map(w=>"- "+w).join("\n") + "\n\n¿Asignar de todos modos?", "Asignar");
      if(!forceWarn) return; 
  }
  
  shift.assigned.push(pub); renderPreviewTable(); openShiftEditModal(shiftIndex); 
}

async function manualRemove(shiftIndex, pubId) {
  let shift = draftSchedule[shiftIndex]; let pub = shift.assigned.find(p => p.id === pubId);
  
  if(pub.hardPair && pub.partner && shift.assigned.find(p => p.id === pub.partner)) { 
      const confirm1 = await showConfirm(`⚠️ Estás separando a una pareja estricta. ¿Continuar?`, "Separar");
      if(!confirm1) return; 
  }
  
  let partnerOf = shift.assigned.find(p => p.hardPair && p.partner === pubId);
  if(partnerOf) { 
      const confirm2 = await showConfirm(`⚠️ Estás quitando al compañero de ${partnerOf.firstName} (Pareja Estricta). ¿Continuar?`, "Quitar");
      if(!confirm2) return; 
  }
  
  shift.assigned = shift.assigned.filter(p => p.id !== pubId);
  renderPreviewTable(); openShiftEditModal(shiftIndex); 
}

async function publishSchedule() {
  if (draftSchedule.length === 0) return;
  const isConfirmed = await showConfirm('¿Estás seguro de guardar y publicar este programa?', 'Guardar Programa', '#28a745');
  if (!isConfirmed) return;
  
  const btn = document.getElementById('btn-publish-bottom'); 
  btn.innerHTML = `<span class="material-symbols-outlined">sync</span> Guardando...`; btn.disabled = true;
  
  try {
    for (const shift of draftSchedule) {
      if (shift.docId) { await db.collection('shifts').doc(shift.docId).update({ participants: shift.assigned.map(p => p.id) }); } 
      else { await db.collection('shifts').add({ date: shift.dateString, location: shift.location, time: shift.time, capacity: shift.capacity, participants: shift.assigned.map(p => p.id) }); }
    }
    showToast('¡Programa guardado y publicado exitosamente!'); 
    document.getElementById('schedule-preview-container').style.display = 'none';
    draftSchedule = []; checkMonthStatus(); 
  } catch (error) { showToast("Error: " + error.message, "error"); } 
  finally { btn.innerHTML = `<span class="material-symbols-outlined">cloud_upload</span> Guardar y Publicar`; btn.disabled = false; }
}
