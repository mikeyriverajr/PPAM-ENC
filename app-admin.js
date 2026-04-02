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
const storage = firebase.storage();
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
  if (tabId === 'schedule') {
    loadLocations();
    checkMonthStatus();
  }
}

// ==========================================
// TAB 1: DIRECTORIO 
// ==========================================
let allPublishers = []; 
let currentLinkedUserDocId = null; 
let currentAbsences = [];
let currentViewId = null;

document.addEventListener("DOMContentLoaded", function() {
    const partnerSelect = document.getElementById('pub-partner');
    if(partnerSelect) {
        partnerSelect.addEventListener('change', function() {
            document.getElementById('pub-hardpair-container').style.display = this.value ? 'flex' : 'none';
            if(!this.value) document.getElementById('pub-hardpair').checked = false;
        });
    }
    const emailInput = document.getElementById('pub-email');
    if(emailInput) {
        emailInput.addEventListener('input', function() {
            document.getElementById('pub-email-notif-container').style.display = this.value.trim() ? 'flex' : 'none';
            if(!this.value.trim()) document.getElementById('pub-email-notif').checked = false;
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
      card.onclick = () => viewPublisher(pub.id);
      
      const genderIcon = pub.gender === 'M' ? 'woman' : 'man';
      const statusBadge = pub.status === 'Entrenamiento' ? `<span class="badge-warning">Entrenamiento</span>` : '';
      const hardPairBadge = pub.hardPair ? `<span class="badge-red">Pareja Estricta</span>` : '';
      card.innerHTML = `
        <div><h4 class="pub-name" style="margin:0 0 5px 0; display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="color:#5d7aa9;">${genderIcon}</span> ${pub.firstName} ${pub.lastName} ${statusBadge} ${hardPairBadge}</h4>
        <p style="margin:0; font-size:0.85em; color:#666; margin-left: 30px;">Turnos al mes: ${pub.maxShifts || '5'} | Compañero: ${pub.partnerName || 'Ninguno'}</p></div>
        <span class="material-symbols-outlined" style="color:#ccc;">chevron_right</span>
      `;
      listDiv.appendChild(card);
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName}</option>`;
    });
  } catch (error) { listDiv.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar.</p>'; }
}

function viewPublisher(id) {
    const pub = allPublishers.find(p => p.id === id);
    if(!pub) return;
    currentViewId = id;
    
    document.getElementById('view-pub-name').innerHTML = `<span class="material-symbols-outlined" style="color:#5d7aa9; font-size:32px;">${pub.gender === 'M' ? 'woman' : 'man'}</span> ${pub.firstName} ${pub.lastName}`;
    document.getElementById('view-pub-status').innerHTML = pub.status === 'Entrenamiento' ? '<span style="color:#856404; font-weight:bold;">⚠️ Entrenamiento</span>' : '✅ Aprobado';
    document.getElementById('view-pub-max').innerText = `${pub.maxShifts || 5} turnos`;
    document.getElementById('view-pub-partner').innerText = pub.partnerName ? `${pub.partnerName} ${pub.hardPair ? '(Estricto)' : ''}` : 'Ninguno';
    
    document.getElementById('view-pub-phone').innerText = pub.phone || '-';
    document.getElementById('view-pub-email').innerText = pub.notificationEmail || '-';
    document.getElementById('view-pub-ename').innerText = pub.emergencyName || '-';
    document.getElementById('view-pub-ephone').innerText = pub.emergencyPhone || '-';
    
    document.getElementById('pub-view-modal').style.display = 'flex';
}

function closePubViewModal() { document.getElementById('pub-view-modal').style.display = 'none'; }

function switchToEditPub() {
    const idToEdit = currentViewId;
    if(!idToEdit) return;
    closePubViewModal();
    editPublisher(idToEdit);
}

async function openNewPublisherModal() {
    clearPublisherForm();
    await buildAdminAvailabilityForm([]);
    document.getElementById('pub-edit-modal').style.display = 'flex';
}

function closePubEditModal() { document.getElementById('pub-edit-modal').style.display = 'none'; }

async function buildAdminAvailabilityForm(pubAvailability = []) {
  const container = document.getElementById('admin-avail-container');
  try {
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const grouped = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };
    
    locSnapshot.forEach(doc => {
      const loc = doc.data();
      const locId = doc.id; 
      (loc.templates || []).forEach(t => {
        if (grouped[t.day] !== undefined) grouped[t.day].push({ name: loc.name, time: `${t.startTime}-${t.endTime}`, val: `${locId}_${t.day}_${t.startTime}` });
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
          html += `<div class="admin-avail-check"><input type="checkbox" id="admin-chk-${s.val}" class="admin-avail-checkbox" value="${s.val}" ${isChecked} style="width:16px; height:16px; accent-color:#5d7aa9; cursor:pointer;"><label for="admin-chk-${s.val}" style="cursor:pointer;">${s.name} (${s.time})</label></div>`;
        });
        div.innerHTML = html; container.appendChild(div);
      }
    });
    if (!hasShifts) container.innerHTML = '<p style="text-align:center; color:#666; font-size:0.85em;">No hay ubicaciones activas en el sistema.</p>';
  } catch (error) { container.innerHTML = '<p style="color:red; font-size:0.8em;">Error al cargar disponibilidad.</p>'; }
}

function renderAbsences() {
    const list = document.getElementById('absences-list');
    list.innerHTML = '';
    currentAbsences.forEach((abs, index) => {
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:10px; border-radius:6px; font-size:0.9em;">
            <span><strong style="color:#dc3545;">✈️ Ausente:</strong> ${formatSpanishDate(abs.start)} - ${formatSpanishDate(abs.end)}</span>
            <button type="button" onclick="removeAbsence(${index})" class="btn-action btn-danger" style="padding:4px 8px;"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
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
  document.getElementById('pub-istrainer').checked = pub.isTrainer || false;
  document.getElementById('pub-ismanager').checked = pub.isShiftManager || false;
  document.getElementById('pub-max').value = pub.maxShifts || '5';
  document.getElementById('pub-partner').value = pub.partner || '';
  document.getElementById('pub-hardpair-container').style.display = pub.partner ? 'flex' : 'none';
  document.getElementById('pub-hardpair').checked = pub.hardPair || false;
  
  document.getElementById('pub-phone').value = pub.phone || '';
  document.getElementById('pub-email').value = pub.notificationEmail || '';
  document.getElementById('pub-email-notif-container').style.display = pub.notificationEmail ? 'flex' : 'none';
  document.getElementById('pub-email-notif').checked = pub.emailNotificationsEnabled || false;
  document.getElementById('pub-emerg-name').value = pub.emergencyName || '';
  document.getElementById('pub-emerg-phone').value = pub.emergencyPhone || '';

  await buildAdminAvailabilityForm(pub.availability || []);
  currentAbsences = pub.absences || [];
  renderAbsences();

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
  
  document.getElementById('pub-edit-modal').style.display = 'flex';
}

async function savePublisher() {
  const id = document.getElementById('pub-id').value;
  const firstName = document.getElementById('pub-firstname').value.trim();
  const lastName = document.getElementById('pub-lastname').value.trim();
  const gender = document.getElementById('pub-gender').value;
  const partnerId = document.getElementById('pub-partner').value;
  const hardPair = document.getElementById('pub-hardpair').checked;
  const status = document.getElementById('pub-status').value;
  const isTrainer = document.getElementById('pub-istrainer').checked;
  const isShiftManager = document.getElementById('pub-ismanager').checked;
  const maxShifts = parseInt(document.getElementById('pub-max').value) || 5;
  const phone = document.getElementById('pub-phone').value.trim();
  const notificationEmail = document.getElementById('pub-email').value.trim();
  const emergencyName = document.getElementById('pub-emerg-name').value.trim();
  const emergencyPhone = document.getElementById('pub-emerg-phone').value.trim();
  const emailNotificationsEnabled = document.getElementById('pub-email-notif').checked;
  const availability = Array.from(document.querySelectorAll('.admin-avail-checkbox:checked')).map(cb => cb.value);

  const username = document.getElementById('pub-username').value.trim();
  const password = document.getElementById('pub-password').value;
  const role = document.getElementById('pub-role').value;
  const usernameIsDisabled = document.getElementById('pub-username').disabled;
  
  if (!firstName || !lastName) { showToast('El nombre y apellido son obligatorios.', 'error'); return; }

  const email = username ? username.toLowerCase().replace(/\s+/g, '') + '@ppam.app' : '';
  let partnerName = "";
  if (partnerId) { const pObj = allPublishers.find(p => p.id === partnerId); if (pObj) partnerName = `${pObj.firstName} ${pObj.lastName}`; }
  
  const pubData = { firstName, lastName, gender, status, isTrainer, isShiftManager, partner: partnerId, partnerName, hardPair, maxShifts, phone, notificationEmail, emailNotificationsEnabled, emergencyName, emergencyPhone, availability, absences: currentAbsences };

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
    closePubEditModal();
    setTimeout(() => { loadPublishers(); }, 500);
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
    closePubEditModal();
    loadPublishers();
  } catch (error) { showToast("Error: " + error.message, "error"); }
}

function clearPublisherForm() {
  document.getElementById('pub-form-title').innerText = 'Nuevo Publicador';
  document.getElementById('pub-id').value = '';
  document.getElementById('pub-firstname').value = '';
  document.getElementById('pub-lastname').value = '';
  document.getElementById('pub-gender').value = 'H';
  document.getElementById('pub-status').value = 'Aprobado';
  document.getElementById('pub-istrainer').checked = false;
  document.getElementById('pub-ismanager').checked = false;
  document.getElementById('pub-max').value = '5';
  document.getElementById('pub-partner').value = '';
  document.getElementById('pub-hardpair-container').style.display = 'none';
  document.getElementById('pub-hardpair').checked = false;
  document.getElementById('pub-phone').value = '';
  document.getElementById('pub-email').value = '';
  document.getElementById('pub-email-notif-container').style.display = 'none';
  document.getElementById('pub-email-notif').checked = false;
  document.getElementById('pub-emerg-name').value = '';
  document.getElementById('pub-emerg-phone').value = '';
  document.getElementById('pub-username').value = '';
  document.getElementById('pub-password').value = '';
  document.getElementById('pub-username').disabled = false;
  document.getElementById('pub-password').disabled = false;
  document.getElementById('pub-role').disabled = false;
  document.getElementById('pub-password').placeholder = "Mínimo 6 caracteres";
  document.getElementById('btn-delete-pub').style.display = 'none';
  document.getElementById('btn-unlink').style.display = 'none';
  currentLinkedUserDocId = null;
  currentAbsences = [];
  renderAbsences();
  document.getElementById('account-status-msg').innerText = "Opcional al crear un usuario nuevo.";
}

function filterPublishers() {
  const input = document.getElementById('pub-search').value.toLowerCase();
  const cards = document.querySelectorAll('.pub-card');
  cards.forEach(c => { c.style.display = c.querySelector('.pub-name').innerText.toLowerCase().includes(input) ? 'flex' : 'none'; });
}

// ==========================================
// TAB 2: LOCATIONS (QUICK BUILDER FIX)
// ==========================================
// Initialize draft listener when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to ensure allPublishers is loaded first, though ideally it should be chained.
    setTimeout(initDraftListener, 1000);
});

async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p style="color:#666; text-align:center;">Cargando ubicaciones...</p>';
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666; text-align:center;">No hay ubicaciones registradas.</p>'; return; }
    listDiv.innerHTML = '';
    const generatorLocsDiv = document.getElementById('generator-locations');
    if (generatorLocsDiv) generatorLocsDiv.innerHTML = '';

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

      // Populate Generator Checkboxes for active locations
      if (loc.isActive !== false && generatorLocsDiv) {
          const cbDiv = document.createElement('div');
          cbDiv.style.cssText = "display:flex; align-items:center; gap:5px;";
          cbDiv.innerHTML = `
            <input type="checkbox" id="gen-loc-${doc.id}" value="${doc.id}" checked>
            <label for="gen-loc-${doc.id}" style="font-weight:bold; cursor:pointer;">${loc.name}</label>
          `;
          generatorLocsDiv.appendChild(cbDiv);
      }
    });

    if(generatorLocsDiv && generatorLocsDiv.innerHTML === '') {
        generatorLocsDiv.innerHTML = '<p style="color:#dc3545; font-size:0.9em; margin:0;">No hay ubicaciones activas disponibles.</p>';
    }
  } catch (error) { listDiv.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar ubicaciones.</p>'; }
}

function openLocationModal() {
  if(!quillEditor) initQuill();
  document.getElementById('location-modal').style.display = 'flex';
  document.getElementById('loc-id').value = ''; document.getElementById('loc-name').value = ''; 
  document.getElementById('loc-capacity').value = '2'; document.getElementById('loc-status').value = 'true';
  document.getElementById('loc-maps-url').value = '';
  document.getElementById('loc-req-manager').checked = false;
  document.getElementById('loc-modal-title').innerText = 'Nueva Ubicación';
  document.getElementById('btn-delete-loc').style.display = 'none';
  document.getElementById('shifts-container').innerHTML = '';
  if (quillEditor) quillEditor.root.innerHTML = '';
}
function closeLocationModal() { document.getElementById('location-modal').style.display = 'none'; }

function executeQuickBuild() {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const startStr = document.getElementById('qb-start').value;
    const endStr = document.getElementById('qb-end').value;
    const durHours = parseFloat(document.getElementById('qb-duration').value);
    
    if(!startStr || !endStr || !durHours) { showToast("Completa los datos del generador rápido.", "error"); return; }
    
    const selectedDays = days.filter(d => document.getElementById('qb-' + d).checked);
    if(selectedDays.length === 0) { showToast("Selecciona al menos un día.", "error"); return; }
    
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    let startMinTotal = startH * 60 + startM;
    const endMinTotal = endH * 60 + endM;
    const durMins = Math.floor(durHours * 60);
    
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
  row.innerHTML = `<select class="shift-day form-group" style="margin:0; flex:2; padding:10px;">${options}</select><input type="time" class="shift-start form-group" value="${start}" style="margin:0; flex:1; padding:10px;"><input type="time" class="shift-end form-group" value="${end}" style="margin:0; flex:1; padding:10px;"><button type="button" onclick="this.parentElement.remove()" class="btn-action btn-danger" style="margin:0; padding:10px;"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>`;
  container.appendChild(row);
}

async function saveLocation() {
  const id = document.getElementById('loc-id').value;
  const name = document.getElementById('loc-name').value.trim();
  const capacity = parseInt(document.getElementById('loc-capacity').value) || 2;
  const isActive = document.getElementById('loc-status').value === 'true';
  const requiresManager = document.getElementById('loc-req-manager').checked;
  const mapsUrl = document.getElementById('loc-maps-url').value.trim();
  const infoHtml = quillEditor ? quillEditor.root.innerHTML.trim() : "";

  if (!name) { showToast("El nombre es obligatorio", "error"); return; }
  
  const templates = [];
  document.querySelectorAll('.shift-row').forEach(row => { templates.push({ day: row.querySelector('.shift-day').value, startTime: row.querySelector('.shift-start').value, endTime: row.querySelector('.shift-end').value }); });
  
  const locationData = { name, capacity, isActive, requiresManager, mapsUrl, infoHtml, templates };
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
    document.getElementById('loc-maps-url').value = loc.mapsUrl || '';
    if (quillEditor && loc.infoHtml) {
        quillEditor.clipboard.dangerouslyPasteHTML(loc.infoHtml);
    }
    document.getElementById('loc-req-manager').checked = loc.requiresManager || false;
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
// TAB 3: GENERATOR (ABSENCE/TRAINEE LOGIC)
// ==========================================
let draftSchedule = []; 

async function checkMonthStatus() {
    await loadDayManagers();
    await loadPublishedMonthsList();
}

async function loadPublishedMonthsList() {
    const select = document.getElementById('gen-month');
    if (!select) return;

    select.innerHTML = '<option value="">Cargando meses publicados...</option>';
    select.disabled = true;

    try {
        // Query to find distinct months that have shifts. Since we can't do distinct in Firestore easily,
        // we'll fetch all shifts or group them if there's a tracker. Alternatively, we just query limits.
        // For efficiency, we will assume a reasonable window or fetch active shifts.
        const shiftsSnap = await db.collection('shifts').orderBy('date', 'desc').get();
        const monthsSet = new Set();

        shiftsSnap.forEach(doc => {
            const dateStr = doc.data().date; // YYYY-MM-DD
            if (dateStr) {
                monthsSet.add(dateStr.substring(0, 7)); // YYYY-MM
            }
        });

        const monthsArray = Array.from(monthsSet).sort().reverse();

        select.innerHTML = '';
        if (monthsArray.length === 0) {
            select.innerHTML = '<option value="">Ningún mes publicado</option>';
        } else {
            const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            monthsArray.forEach(m => {
                const [yyyy, mm] = m.split('-');
                const name = `${monthNames[parseInt(mm)-1]} ${yyyy}`;
                select.innerHTML += `<option value="${m}">${name}</option>`;
            });
        }
    } catch (e) {
        select.innerHTML = '<option value="">Error cargando meses</option>';
        console.error(e);
    } finally {
        select.disabled = false;
    }
}

async function loadDayManagers() {
    const container = document.getElementById('day-managers-container');
    container.innerHTML = '<p style="color:#666; font-size:0.85em;">Cargando encargados del día...</p>';
    try {
        const settingsDoc = await db.collection('settings').doc('dayManagers').get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};

        let pubOptions = `<option value="">Ninguno</option>`;
        const sortedPubs = [...allPublishers].sort((a,b) => (a.firstName || '').localeCompare(b.firstName || ''));
        sortedPubs.forEach(p => pubOptions += `<option value="${p.id}">${p.firstName} ${p.lastName}</option>`);

        const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        container.innerHTML = '';

        days.forEach(day => {
            const currentId = settings[day] || '';
            const div = document.createElement('div');
            div.style.cssText = 'flex: 1; min-width: 120px; background: white; padding: 10px; border: 1px solid #eaeaea; border-radius: 8px;';
            div.innerHTML = `
                <label style="display:block; font-size:0.85em; color:#5d7aa9; font-weight:bold; margin-bottom:5px;">${day}</label>
                <select id="day-manager-${day}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:0.9em;">
                    ${pubOptions}
                </select>
            `;
            container.appendChild(div);
            document.getElementById(`day-manager-${day}`).value = currentId;
        });
    } catch(e) { container.innerHTML = '<p style="color:red;">Error al cargar encargados del día.</p>'; }
}

async function saveDayManagers() {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const data = {};
    days.forEach(day => {
        data[day] = document.getElementById(`day-manager-${day}`).value;
    });

    try {
        await db.collection('settings').doc('dayManagers').set(data, {merge: true});
        showToast('Encargados del día guardados exitosamente.');
    } catch(e) {
        showToast('Error al guardar encargados.', 'error');
    }
}

async function generateDraft() {
  const btn = document.getElementById('btn-gen-draft');
  btn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> Calculando...`; btn.disabled = true;

  try {
    const startDateStr = document.getElementById('gen-start-date').value;
    const endDateStr = document.getElementById('gen-end-date').value;

    if (!startDateStr || !endDateStr) {
        showToast("Selecciona la fecha de inicio y fin.", "error");
        btn.innerHTML = `<span class="material-symbols-outlined">magic_button</span> Añadir al Borrador`; btn.disabled = false;
        return;
    }

    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');

    if (startDate > endDate) {
        showToast("La fecha de inicio no puede ser mayor a la de fin.", "error");
        btn.innerHTML = `<span class="material-symbols-outlined">magic_button</span> Añadir al Borrador`; btn.disabled = false;
        return;
    }

    // Get selected locations
    const selectedLocIds = [];
    document.querySelectorAll('#generator-locations input[type="checkbox"]:checked').forEach(cb => {
        selectedLocIds.push(cb.value);
    });

    if (selectedLocIds.length === 0) {
        showToast("Selecciona al menos una ubicación.", "error");
        btn.innerHTML = `<span class="material-symbols-outlined">magic_button</span> Añadir al Borrador`; btn.disabled = false;
        return;
    }

    const locsSnap = await db.collection('locations').where('isActive', '==', true).get();
    const locations = [];
    locsSnap.forEach(d => {
        if(selectedLocIds.includes(d.id)) {
            let l=d.data(); l.id=d.id; locations.push(l);
        }
    });

    const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let shiftTasks = [];

    // Iterate through dates
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      let dayName = daysMap[currentDate.getDay()];
      let dateString = formatDate(currentDate);

      locations.forEach(loc => {
        (loc.templates || []).forEach(t => {
          if (t.day === dayName) {
            shiftTasks.push({
              docId: null, dateObj: new Date(currentDate), dateString: dateString,
              location: loc.name, 
              locationId: loc.id, 
              requiresManager: loc.requiresManager || false,
              time: `${t.startTime}-${t.endTime}`,
              capacity: loc.capacity, 
              availKey: `${loc.id}_${t.day}_${t.startTime}`, 
              pool: [], assigned: []
            });
          }
        });
      });
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

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

    // 1. First Pass: Assign Required Local Managers
    shiftTasks.forEach(task => {
        if (task.requiresManager && task.assigned.length < task.capacity) {
            // Find an available manager in the pool
            const manager = task.pool.find(p => p.isShiftManager && canAssign(p.id, task.dateObj, task.dateString));
            if (manager) {
                task.assigned.push(manager);
                assignedCounts[manager.id] = (assignedCounts[manager.id] || 0) + 1;
                if(!assignedDates[manager.id]) assignedDates[manager.id] = new Set();
                assignedDates[manager.id].add(task.dateString);

                // If they have a hard pair, pull them in too if possible
                if (manager.hardPair && manager.partner && task.assigned.length < task.capacity) {
                    const partner = allPublishers.find(p => p.id === manager.partner);
                    if (partner && task.pool.find(p => p.id === partner.id) && canAssign(partner.id, task.dateObj, task.dateString)) {
                        task.assigned.push(partner);
                        assignedCounts[partner.id] = (assignedCounts[partner.id] || 0) + 1;
                        if(!assignedDates[partner.id]) assignedDates[partner.id] = new Set();
                        assignedDates[partner.id].add(task.dateString);
                    }
                }
            }
        }
    });

    // 2. Second Pass: Fill remaining spots with anyone
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

    const finalShifts = shiftTasks.sort((a,b) => a.dateObj - b.dateObj);

    // Save to Firestore draft_shifts collection using a chunked Batch
    const draftRef = db.collection('draft_shifts');
    const chunks = [];
    let currentBatch = db.batch();
    let currentCount = 0;

    finalShifts.forEach(shift => {
        const docRef = draftRef.doc(); // Auto ID
        const participantIds = [];
        shift.assigned.forEach(p => participantIds.push(p.id));
        while(participantIds.length < shift.capacity) { participantIds.push("Disponible"); }

        currentBatch.set(docRef, {
            date: shift.dateString,
            location: shift.location,
            locationId: shift.locationId,
            time: shift.time,
            capacity: shift.capacity,
            participants: participantIds
        });

        currentCount++;
        if (currentCount >= 490) {
            chunks.push(currentBatch.commit());
            currentBatch = db.batch();
            currentCount = 0;
        }
    });

    if (currentCount > 0) {
        chunks.push(currentBatch.commit());
    }

    await Promise.all(chunks);
    showToast("Turnos añadidos al borrador exitosamente.");

  } catch (error) { showToast("Error al generar: " + error.message, "error"); } 
  finally { btn.innerHTML = `<span class="material-symbols-outlined">magic_button</span> Añadir al Borrador`; btn.disabled = false; }
}

async function loadPublishedMonth() {
  const monthVal = document.getElementById('gen-month').value; 
  if (!monthVal) return;
  const startDate = `${monthVal}-01`;
  const endDate = `${monthVal}-31`;

  try {
    const isConfirmed = await showConfirm(`¿Estás seguro de cargar todo el mes de ${monthVal} al borrador?`, "Cargar a Borrador", "#0d6efd");
    if (!isConfirmed) return;

    showToast("Cargando turnos al borrador...", "info");

    const shiftsSnap = await db.collection('shifts').where('date', '>=', startDate).where('date', '<=', endDate).get();
    if (shiftsSnap.empty) { showToast("No hay turnos publicados para este mes.", "info"); return; }
    
    // Process them into draft in chunks
    const chunks = [];
    let currentBatch = db.batch();
    let currentCount = 0;

    shiftsSnap.forEach(doc => {
        const s = doc.data();
        const draftRef = db.collection('draft_shifts').doc(doc.id); // preserve ID
        currentBatch.set(draftRef, s);
        
        currentCount++;
        if (currentCount >= 490) {
            chunks.push(currentBatch.commit());
            currentBatch = db.batch();
            currentCount = 0;
        }
    });

    if (currentCount > 0) {
        chunks.push(currentBatch.commit());
    }

    await Promise.all(chunks);
    showToast("Mes cargado al borrador exitosamente.");
  } catch(e) { showToast("Error cargando: " + e.message, "error"); }
}

async function deletePublishedMonth() {
  const monthVal = document.getElementById('gen-month').value; 
  const isConfirmed = await showConfirm(`⚠️ PELIGRO: Estás a punto de ELIMINAR todo el mes de ${monthVal}.\n\nEsta acción no se puede deshacer y todos perderán sus asignaciones. ¿Eliminar mes en vivo?`, "Eliminar Todo el Mes", "#dc3545");
  if (!isConfirmed) return;

  try {
      const shiftsSnap = await db.collection('shifts').where('date', '>=', `${monthVal}-01`).where('date', '<=', `${monthVal}-31`).get();
      if (shiftsSnap.empty) { showToast("No hay turnos para eliminar en este mes.", "info"); return; }
      
      const chunks = [];
      let currentBatch = db.batch();
      let currentCount = 0;

      shiftsSnap.forEach(doc => {
          currentBatch.delete(doc.ref);
          currentCount++;

          if (currentCount >= 490) {
              chunks.push(currentBatch.commit());
              currentBatch = db.batch();
              currentCount = 0;
          }
      });

      if (currentCount > 0) {
          chunks.push(currentBatch.commit());
      }

      await Promise.all(chunks);
      showToast("Mes eliminado del calendario en vivo con éxito.");
  } catch(e) { showToast("Error al eliminar: " + e.message, "error"); }
}

function renderPreviewTable() {
  document.getElementById('schedule-preview-container').style.display = 'block';
  const tbody = document.getElementById('preview-body');
  document.getElementById('preview-head').innerHTML = `<tr><th>Fecha</th><th>Lugar / Hora</th><th>Asignados</th><th>Acción</th></tr>`;
  tbody.innerHTML = '';
  
  draftSchedule.forEach((shift, index) => {
    let namesHtml = '';
    let hasManager = false;

    shift.assigned.forEach(p => {
        const warn = p.status === 'Entrenamiento' ? `<span class="material-symbols-outlined" style="font-size:14px; color:#ffc107; vertical-align:-2px;" title="En Entrenamiento">warning</span>` : '';
        const mgrBadge = p.isShiftManager ? `<span class="material-symbols-outlined" style="font-size:14px; color:#dc3545; vertical-align:-2px;" title="Encargado Físico">local_police</span>` : '';
        namesHtml += `${p.firstName} ${p.lastName} ${warn}${mgrBadge}, `;
        if (p.isShiftManager) hasManager = true;
    });
    namesHtml = namesHtml.slice(0, -2); 
    
    let warningHtml = '';
    if (shift.requiresManager && !hasManager && shift.assigned.length > 0) {
        warningHtml = `<div style="background:#fff3cd; color:#856404; font-size:0.8em; padding:4px 8px; border-radius:4px; margin-top:5px; border:1px solid #ffeeba; display:inline-block;"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:-2px;">error</span> Falta Encargado</div>`;
    }

    const row = document.createElement('tr');
    const isFull = shift.assigned.length >= shift.capacity;
    const statusColor = isFull ? '#28a745' : '#dc3545';
    
    row.innerHTML = `
      <td style="text-transform: capitalize; font-weight: 500; min-width: 140px;">${formatSpanishDate(shift.dateString)}</td>
      <td><strong>${shift.location}</strong><br><span style="color:#666; font-size:0.9em;">${shift.time}</span></td>
      <td style="color:${statusColor};">
        ${namesHtml || 'Nadie disponible'} <br>
        <span style="font-size:0.85em; opacity: 0.8;">(${shift.assigned.length}/${shift.capacity})</span>
        ${warningHtml}
      </td>
      <td>
        <div style="display:flex; gap: 5px;">
          <button onclick="openShiftEditModal(${index})" class="btn-action btn-primary" style="padding: 6px 12px; font-size: 0.9em;"><span class="material-symbols-outlined" style="font-size:16px;">edit</span> Editar</button>
          <button onclick="deleteDraftShift('${shift.docId}')" class="btn-action btn-danger" style="padding: 6px 12px; font-size: 0.9em;" title="Eliminar este turno"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
        </div>
      </td>
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
    const warn = pub.status === 'Entrenamiento' ? `<span class="badge-warning">Entrenamiento</span>` : '';
    assignedContainer.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:12px; border-radius:8px; border:1px solid #eee;"><span>${pub.firstName} ${pub.lastName} ${warn}</span><button type="button" onclick="manualRemove(${shiftIndex}, '${pub.id}')" class="btn-action btn-danger" style="padding:6px 12px;">Quitar</button></div>`;
  });
  
  const select = document.getElementById('shift-add-select');
  let optionsHtml = `<option value="">Seleccionar publicador...</option>`;
  let availableHtml = `<optgroup label="✅ Disponibles (Aprobados)">`; 
  let traineeHtml = `<optgroup label="⚠️ En Entrenamiento (Asignar Manualmente)">`; 
  let unavailableHtml = `<optgroup label="❌ No Disponibles / Ausentes">`;
  
  const sortedPubs = [...allPublishers].sort((a,b) => (a.firstName || '').localeCompare(b.firstName || ''));
  sortedPubs.forEach(pub => {
    if(shift.assigned.find(p => p.id === pub.id)) return;
    
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
  
  shift.assigned.push(pub);
  updateDraftShiftDb(shift);
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
  updateDraftShiftDb(shift);
}

// --- DRAFT DB HELPERS ---
async function updateDraftShiftDb(shiftObj) {
    if(!shiftObj.docId) return;
    const participantIds = [];
    shiftObj.assigned.forEach(p => participantIds.push(p.id));
    while(participantIds.length < shiftObj.capacity) { participantIds.push("Disponible"); }

    try {
        await db.collection('draft_shifts').doc(shiftObj.docId).update({ participants: participantIds });
        showToast("Turno actualizado en borrador.", "info");
        // We do NOT need to call renderPreviewTable() or openShiftEditModal() because the onSnapshot listener will do it automatically when it detects the DB change!
        // We will just close the modal for a cleaner UX, or re-open it. Since it auto-updates, let's close it so the user sees the table refresh.
        closeShiftEditModal();
    } catch(e) {
        showToast("Error actualizando turno.", "error");
    }
}

async function deleteDraftShift(docId) {
    if(!docId) return;
    const confirmDelete = await showConfirm("¿Estás seguro de eliminar este turno de la mesa de trabajo? (Se eliminará del calendario oficial al guardar)", "Descartar Turno");
    if(!confirmDelete) return;

    try {
        // Instead of hard deleting, we mark it so it can be deleted from the live DB upon publishing
        await db.collection('draft_shifts').doc(docId).update({ markedForDeletion: true });
        showToast("Turno marcado para eliminar.");
    } catch(e) {
        showToast("Error eliminando turno.", "error");
    }
}

async function publishSchedule() {
  const isConfirmed = await showConfirm('¿Estás seguro de guardar los cambios en el Calendario Oficial? Esto aplicará todas las creaciones, ediciones y eliminaciones.', 'Guardar en Calendario Oficial', '#28a745');
  if (!isConfirmed) return;
  
  const btn = document.getElementById('btn-publish-bottom'); 
  btn.innerHTML = `<span class="material-symbols-outlined">sync</span> Guardando...`; btn.disabled = true;
  
  try {
    // 1. Fetch current draft from DB to ensure we publish exactly what is saved
    const draftSnap = await db.collection('draft_shifts').get();
    if (draftSnap.empty) {
        btn.innerHTML = `<span class="material-symbols-outlined">cloud_upload</span> Guardar en Calendario Oficial`; btn.disabled = false;
        return;
    }

    // 2. Queue all draft shifts to be added to the live 'shifts' collection, grouped into chunks
    const chunks = [];
    let currentBatch = db.batch();
    let currentCount = 0;

    draftSnap.forEach(doc => {
        const liveDocRef = db.collection('shifts').doc(doc.id); // Preserve original ID to avoid duplicating published shifts
        const data = doc.data();

        if (data.markedForDeletion) {
            // If the user discarded this shift from the workspace, delete it from the LIVE calendar too
            currentBatch.delete(liveDocRef);
        } else {
            // Otherwise, set/update it in the LIVE calendar
            currentBatch.set(liveDocRef, data);
        }

        // Either way, delete it from the DRAFT workspace
        currentBatch.delete(doc.ref);

        currentCount += 2; // Two operations: 1 live (set/delete), 1 draft delete

        // Firestore batch limit is 500 operations
        if (currentCount >= 490) {
            chunks.push(currentBatch.commit());
            currentBatch = db.batch();
            currentCount = 0;
        }
    });

    // Commit the remaining operations
    if (currentCount > 0) {
        chunks.push(currentBatch.commit());
    }

    // 4. Wait for all batch commits to complete
    await Promise.all(chunks);

    showToast('¡Borrador publicado exitosamente!');
    document.getElementById('schedule-preview-container').style.display = 'none';
    // The real-time listener will automatically empty the draft array and hide the UI
    checkMonthStatus();
  } catch (error) { 
      showToast("Error publicando: " + error.message, "error");
  } finally { 
      btn.innerHTML = `<span class="material-symbols-outlined">cloud_upload</span> Guardar y Publicar`; btn.disabled = false; 
  }
}

async function clearDraft() {
    if (draftSchedule.length === 0) return;
    const isConfirmed = await showConfirm('¿Estás seguro de limpiar y eliminar todo el borrador?', 'Limpiar Borrador', '#dc3545');
    if (!isConfirmed) return;

    try {
        const draftSnap = await db.collection('draft_shifts').get();

        const chunks = [];
        let currentBatch = db.batch();
        let currentCount = 0;

        draftSnap.forEach(doc => {
            currentBatch.delete(doc.ref);
            currentCount++;

            if (currentCount >= 490) {
                chunks.push(currentBatch.commit());
                currentBatch = db.batch();
                currentCount = 0;
            }
        });

        if (currentCount > 0) {
            chunks.push(currentBatch.commit());
        }

        await Promise.all(chunks);
        showToast('Borrador eliminado.');
    } catch(e) {
        showToast("Error limpiando borrador.", "error");
    }
}
window.clearDraft = clearDraft;

// ==========================================
// MANUAL SHIFT INJECTION
// ==========================================
async function openManualShiftModal() {
    const locSelect = document.getElementById('manual-shift-location');
    locSelect.innerHTML = '<option value="">Cargando ubicaciones...</option>';
    
    // Auto-fill the date with the month currently being viewed
    const monthVal = document.getElementById('gen-month').value;
    if (monthVal) { document.getElementById('manual-shift-date').value = `${monthVal}-01`; }
    
    document.getElementById('manual-shift-modal').style.display = 'flex';

    try {
        const locSnap = await db.collection('locations').where('isActive', '==', true).get();
        locSelect.innerHTML = '<option value="">Selecciona una ubicación...</option>';
        locSnap.forEach(doc => {
            locSelect.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
        });
    } catch (e) {
        locSelect.innerHTML = '<option value="">Error al cargar ubicaciones</option>';
    }
}

function closeManualShiftModal() {
    document.getElementById('manual-shift-modal').style.display = 'none';
}

async function saveManualShift() {
    const dateVal = document.getElementById('manual-shift-date').value;
    const locSelect = document.getElementById('manual-shift-location');
    const locId = locSelect.value;
    // Safely get text without optional chaining
    const locName = locSelect.options[locSelect.selectedIndex] ? locSelect.options[locSelect.selectedIndex].text : '';
    const startVal = document.getElementById('manual-shift-start').value;
    const endVal = document.getElementById('manual-shift-end').value;
    const capacity = parseInt(document.getElementById('manual-shift-capacity').value) || 2;

    if (!dateVal || !locId || !startVal || !endVal) {
        showToast("Por favor, completa todos los campos del turno.", "error");
        return;
    }

    try {
        // Create the new shift directly in the database
        await db.collection('shifts').add({
            date: dateVal,
            location: locName,
            locationId: locId, 
            time: `${startVal}-${endVal}`,
            capacity: capacity,
            participants: [] 
        });

        showToast("¡Turno especial añadido con éxito!");
        closeManualShiftModal();
        
        // Refresh the table so the Admin immediately sees the new shift
        loadPublishedMonth(); 
    } catch (error) {
        showToast("Error al añadir el turno: " + error.message, "error");
    }
}

// Initialize Quill Editor
let quillEditor = null;
function initQuill() {
    if (!quillEditor) {
        quillEditor = new Quill('#loc-editor-container', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        ['bold', 'italic', 'underline'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: imageHandler
                    }
                }
            },
            placeholder: 'Escribe instrucciones, FAQ, o adjunta imágenes...'
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
   // Wait for DOM to load before init
   setTimeout(initQuill, 500);
});

window.initQuill = initQuill;

// --- IMAGE HANDLING & COMPRESSION ---
function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        showToast("Comprimiendo imagen...", "info");
        try {
            // 1. Compress Image (Canvas)
            const compressedBlob = await compressImage(file, 800); // max width 800px

            // 2. Upload to Firebase Storage
            showToast("Subiendo imagen...", "info");
            const storageRef = storage.ref();
            const fileName = `locations/${Date.now()}_${file.name}`;
            const imageRef = storageRef.child(fileName);

            await imageRef.put(compressedBlob);
            const downloadUrl = await imageRef.getDownloadURL();

            // 3. Insert into Quill Editor
            const range = quillEditor.getSelection();
            quillEditor.insertEmbed(range.index, 'image', downloadUrl);
            showToast("Imagen subida con éxito.");
        } catch (error) {
            console.error("Error al procesar la imagen:", error);
            showToast("Error al subir la imagen.", "error");
        }
    };
}

function compressImage(file, maxWidth) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height *= maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.7 quality
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.7);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// --- DRAFT REAL-TIME LISTENER ---
let draftUnsubscribe = null;

async function initDraftListener() {
    if (draftUnsubscribe) draftUnsubscribe();

    // Fetch locations to know which ones require a manager
    const locsSnap = await db.collection('locations').get();
    const locMap = {};
    locsSnap.forEach(d => { locMap[d.data().name] = { id: d.id, requiresManager: d.data().requiresManager || false }; });

    draftUnsubscribe = db.collection('draft_shifts').orderBy('date', 'asc').onSnapshot(snapshot => {
        draftSchedule = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.markedForDeletion) return; // Hide deleted shifts from UI workspace

            data.id = doc.id; // Keep the document ID

            // Map the "participants" UID array back into the "assigned" object array expected by the UI
            const assignedPubs = [];
            (data.participants || []).forEach(uid => {
                if (uid && uid !== "Disponible") {
                    const pub = allPublishers.find(p => p.id === uid);
                    if (pub) assignedPubs.push(pub);
                }
            });

            const locRequiresManager = locMap[data.location]?.requiresManager || false;

            draftSchedule.push({
                docId: doc.id,
                dateString: data.date,
                location: data.location,
                locationId: data.locationId,
                time: data.time,
                capacity: data.capacity,
                assigned: assignedPubs,
                requiresManager: locRequiresManager
            });
        });

        // Show container if there is AT LEAST ONE document in the snapshot (even if markedForDeletion)
        // so the user can still click 'Guardar y Publicar' to execute the deletions.
        if(!snapshot.empty) {
            document.getElementById('schedule-preview-container').style.display = 'block';
            renderPreviewTable();
        } else {
            document.getElementById('schedule-preview-container').style.display = 'none';
        }
    }, error => {
        console.error("Error fetching draft: ", error);
    });
}
