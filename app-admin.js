// app-admin.js - Complete File
// firebaseConfig is loaded from firebase-config.js

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
        await loadPublishers();
        await initDraftListener();
      } else {
        auth.signOut();
        document.getElementById('login-error').innerText = "Acceso Denegado: Esta cuenta no tiene permisos de Administrador.";
      }
    } catch (e) { console.error(e); auth.signOut(); }
  } else {
    if (typeof draftUnsubscribe === 'function' && draftUnsubscribe) {
      draftUnsubscribe();
      draftUnsubscribe = null;
    }
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
  auth.signInWithEmailAndPassword(email, pass).catch(e => {
    console.error("Firebase Admin Login Error:", e);
    errorDiv.innerText = `Error: Verifica tu usuario o contraseña. (${e.code || e.message})`;
  });
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
  if (tabId === 'availability') {
      loadAvailabilityLocations();
  }
  if (tabId === 'reports') {
      loadShiftReports();
  }
}

// ==========================================
// TAB 1: DIRECTORIO 
// ==========================================
var allPublishers = [];
let currentLinkedUserDocId = null; 
let currentAbsences = [];
let currentViewId = null;
let currentEditPhotoUrl = '';

function getAdminInitials(firstName, lastName) {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  if (!f && !l) return '?';
  return ((f[0] || '') + (l[0] || f[1] || '')).toUpperCase();
}

function getAdminAvatarHtml(pub, sizePx = 36) {
  if (pub && pub.photoUrl) {
    return `<span style="width:${sizePx}px; height:${sizePx}px; border-radius:50%; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; border:2px solid #dce4ee; background:#eee;">
      <img src="${pub.photoUrl}" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
    </span>`;
  }
  const genderIcon = pub && pub.gender === 'M' ? 'woman' : 'man';
  return `<span style="width:${sizePx}px; height:${sizePx}px; border-radius:50%; background:#eef2f7; color:#5d7aa9; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid #dce4ee;">
    <span class="material-symbols-outlined" style="font-size:${Math.round(sizePx * 0.6)}px;">${genderIcon}</span>
  </span>`;
}

function compressAdminAvatarDataUrl(file, size = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - minSide) / 2);
        const sy = Math.floor((img.height - minSide) / 2);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = err => reject(err);
    };
    reader.onerror = err => reject(err);
  });
}

function renderAdminPubPhotoPreview() {
  const preview = document.getElementById('admin-pub-avatar-preview');
  const status = document.getElementById('admin-pub-avatar-status');
  const removeBtn = document.getElementById('btn-admin-remove-photo');
  if (!preview) return;

  if (currentEditPhotoUrl) {
    preview.style.background = '#eee';
    preview.innerHTML = `<img src="${currentEditPhotoUrl}" alt="Foto" style="width:100%; height:100%; object-fit:cover; display:block;">`;
    if (status) status.innerHTML = '<span style="color:#28a745; font-weight:600;">✓ Foto cargada (haz clic en Guardar)</span>';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.style.background = '#5d7aa9';
    preview.innerHTML = `<span class="material-symbols-outlined">person</span>`;
    if (status) status.innerText = 'Opcional • Visible para compañeros de turno';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function handleAdminPubPhotoUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    currentEditPhotoUrl = await compressAdminAvatarDataUrl(file, 160);
    renderAdminPubPhotoPreview();
    showToast("Foto procesada. Recuerda guardar el publicador.", "info");
  } catch (e) {
    showToast("Error al procesar la foto.", "error");
  } finally {
    event.target.value = '';
  }
}

function removeAdminPubPhoto() {
  currentEditPhotoUrl = '';
  renderAdminPubPhotoPreview();
}

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
      
      const avatarHtml = getAdminAvatarHtml(pub, 38);
      const statusBadge = pub.status === 'Entrenamiento' ? `<span class="badge-warning">Entrenamiento</span>` : '';
      const hardPairBadge = pub.hardPair ? `<span class="badge-red">Pareja Estricta</span>` : '';
      const cancelCount = getPublisherCancelCount(pub);
      const cancelBadge = cancelCount > 0 ? `<span class="badge-red" title="Turnos cancelados">Cancelaciones: ${cancelCount}</span>` : '';
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          ${avatarHtml}
          <div>
            <h4 class="pub-name" style="margin:0 0 4px 0; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">${pub.firstName} ${pub.lastName || ''} ${statusBadge} ${hardPairBadge} ${cancelBadge}</h4>
            <p style="margin:0; font-size:0.85em; color:#666;">Turnos al mes: ${pub.maxShifts || '5'} | Compañero: ${pub.partnerName || 'Ninguno'}</p>
          </div>
        </div>
        <span class="material-symbols-outlined" style="color:#ccc;">chevron_right</span>
      `;
      listDiv.appendChild(card);
      partnerSelect.innerHTML += `<option value="${pub.id}">${pub.firstName} ${pub.lastName || ''}</option>`;
    });
    if (typeof draftSchedule !== 'undefined' && draftSchedule.length > 0) {
      draftSchedule.forEach(shift => {
        if (Array.isArray(shift.participantIds)) {
          shift.assigned = [];
          shift.participantIds.forEach(uid => {
            if (uid && uid !== "Disponible") {
              const pub = allPublishers.find(p => p.id === uid);
              if (pub) shift.assigned.push(pub);
            }
          });
        }
      });
      renderPreviewTable();
    }
  } catch (error) { listDiv.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar.</p>'; }
}

function getPublisherCancelCount(pub) {
    if (!pub) return 0;
    const historyLen = Array.isArray(pub.cancellationHistory) ? pub.cancellationHistory.length : 0;
    if (typeof pub.cancelledCount === 'number') {
        return Math.max(pub.cancelledCount, historyLen);
    }
    if (historyLen > 0) return historyLen;
    if (pub.lastCancelledShift) return 1;
    return 0;
}

function formatIsoTimestamp(isoString) {
    if (!isoString) return 'Nunca';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Nunca';
    return `${formatSpanishDate(isoString.split('T')[0])} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function viewPublisher(id) {
    const pub = allPublishers.find(p => p.id === id);
    if(!pub) return;
    currentViewId = id;
    
    document.getElementById('view-pub-name').innerHTML = `${getAdminAvatarHtml(pub, 44)} <span>${pub.firstName} ${pub.lastName || ''}</span>`;
    document.getElementById('view-pub-status').innerHTML = pub.status === 'Entrenamiento' ? '<span style="color:#856404; font-weight:bold;">⚠️ Entrenamiento</span>' : '✅ Aprobado';
    document.getElementById('view-pub-max').innerText = `${pub.maxShifts || 5} turnos`;
    document.getElementById('view-pub-partner').innerText = pub.partnerName ? `${pub.partnerName} ${pub.hardPair ? '(Estricto)' : ''}` : 'Ninguno';
    
    document.getElementById('view-pub-phone').innerText = pub.phone || '-';
    document.getElementById('view-pub-email').innerText = pub.notificationEmail || '-';
    document.getElementById('view-pub-ename').innerText = pub.emergencyName || '-';
    document.getElementById('view-pub-ephone').innerText = pub.emergencyPhone || '-';

    document.getElementById('view-pub-lastlogin').innerText = formatIsoTimestamp(pub.lastLogin);
    document.getElementById('view-pub-lastprofile').innerText = formatIsoTimestamp(pub.lastProfileChange);
    document.getElementById('view-pub-lastcancel').innerText = formatIsoTimestamp(pub.lastCancelledShift);

    document.getElementById('view-pub-shifts-count').innerText = '...';
    document.getElementById('view-pub-cancels-count').innerText = getPublisherCancelCount(pub);
    document.getElementById('view-pub-interactions-count').innerText = '...';
    document.getElementById('view-pub-history-container').innerHTML = '<p style="margin: 0; color: #666; font-size: 0.9em; text-align: center;">Cargando historial de turnos...</p>';
    
    document.getElementById('pub-view-modal').style.display = 'flex';
    await loadPublisherShiftHistory(pub);
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

function getBaseLocationName(name) {
  if (!name) return '';
  return name.trim().replace(/[\s\-_#()]*\d+\)?\s*$/, '').trim() || name.trim();
}

let allActiveLocationsCache = [];

function buildEquivalentAvailKeysMap(locationsList) {
  const groupToKeys = {};
  const keyToEquivKeys = {};
  (locationsList || []).forEach(loc => {
    const locId = loc.id;
    const baseName = getBaseLocationName(loc.name).toLowerCase();
    (loc.templates || []).forEach(t => {
      const availKey = `${locId}_${t.day}_${t.startTime}`;
      const groupKey = `${baseName}__${t.day}__${t.startTime}`;
      if (!groupToKeys[groupKey]) groupToKeys[groupKey] = [];
      if (!groupToKeys[groupKey].includes(availKey)) {
        groupToKeys[groupKey].push(availKey);
      }
    });
  });
  Object.values(groupToKeys).forEach(keysArr => {
    keysArr.forEach(k => {
      keyToEquivKeys[k] = keysArr;
    });
  });
  return keyToEquivKeys;
}

function isPubAvailableForSlot(pub, availKey, equivMap = null) {
  const pubAvail = (pub && pub.availability) || [];
  if (pubAvail.includes(availKey)) return true;
  const map = equivMap || buildEquivalentAvailKeysMap(allActiveLocationsCache);
  const equivKeys = map[availKey];
  if (equivKeys && equivKeys.length > 1) {
    return equivKeys.some(k => pubAvail.includes(k));
  }
  return false;
}

async function buildAdminAvailabilityForm(pubAvailability = []) {
  const container = document.getElementById('admin-avail-container');
  try {
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const groupedMap = { 'Lunes': {}, 'Martes': {}, 'Miércoles': {}, 'Jueves': {}, 'Viernes': {}, 'Sábado': {}, 'Domingo': {} };
    
    allActiveLocationsCache = [];
    locSnapshot.forEach(doc => {
      const loc = doc.data();
      const locId = doc.id;
      allActiveLocationsCache.push({ ...loc, id: locId });
      const baseName = getBaseLocationName(loc.name);
      (loc.templates || []).forEach(t => {
        if (groupedMap[t.day] !== undefined) {
          const availKey = `${locId}_${t.day}_${t.startTime}`;
          const timeLabel = `${t.startTime}-${t.endTime}`;
          const slotGroupKey = `${baseName.toLowerCase()}__${t.startTime}_${t.endTime}`;
          if (!groupedMap[t.day][slotGroupKey]) {
            groupedMap[t.day][slotGroupKey] = {
              baseName: baseName,
              originalNames: [loc.name],
              time: timeLabel,
              keys: [availKey]
            };
          } else if (!groupedMap[t.day][slotGroupKey].keys.includes(availKey)) {
            groupedMap[t.day][slotGroupKey].keys.push(availKey);
            groupedMap[t.day][slotGroupKey].originalNames.push(loc.name);
          }
        }
      });
    });
    
    container.innerHTML = '';
    let hasShifts = false;
    daysOrder.forEach(day => {
      const slots = Object.values(groupedMap[day]);
      if (slots.length > 0) {
        hasShifts = true;
        slots.sort((a, b) => a.time.localeCompare(b.time) || a.baseName.localeCompare(b.baseName));
        const div = document.createElement('div'); div.className = 'admin-avail-day';
        let html = `<h5>${day}</h5>`;
        slots.forEach(s => {
          const displayName = s.keys.length > 1 ? s.baseName : s.originalNames[0];
          const isChecked = s.keys.some(k => pubAvailability.includes(k)) ? 'checked' : '';
          const combinedVal = s.keys.join(',');
          const domId = `admin-chk-${s.keys[0]}`;
          html += `<div class="admin-avail-check"><input type="checkbox" id="${domId}" class="admin-avail-checkbox" value="${combinedVal}" ${isChecked} style="width:16px; height:16px; accent-color:#5d7aa9; cursor:pointer;"><label for="${domId}" style="cursor:pointer;">${displayName} (${s.time})</label></div>`;
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
  currentEditPhotoUrl = pub.photoUrl || '';
  renderAdminPubPhotoPreview();

  document.getElementById('btn-delete-pub').style.display = 'inline-flex';
  
  const userQuery = await db.collection('users').where('publisherId', '==', id).get();
  if (!userQuery.empty) {
     const userDoc = userQuery.docs[0];
     currentLinkedUserDocId = userDoc.id;
     const userData = userDoc.data();
     document.getElementById('pub-username').value = userData.username || '';
     document.getElementById('pub-password').value = '';
     document.getElementById('pub-username').disabled = true;
     document.getElementById('pub-password').disabled = false; // Enabled for resetting
     document.getElementById('pub-role').value = userData.role || 'user';
     document.getElementById('pub-password').placeholder = "Nueva contraseña";
     document.getElementById('account-status-msg').innerText = "✅ Este publicador ya tiene cuenta vinculada.";
     document.getElementById('btn-unlink').style.display = 'inline-flex';
     document.getElementById('btn-reset-pw').style.display = 'block';
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
     document.getElementById('btn-reset-pw').style.display = 'none';
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
  const availSet = new Set();
  document.querySelectorAll('.admin-avail-checkbox:checked').forEach(cb => {
    cb.value.split(',').forEach(k => { if (k.trim()) availSet.add(k.trim()); });
  });
  const availability = Array.from(availSet);

  const phoneRegex = /^\+\d+$/;
  if (phone && !phoneRegex.test(phone.replace(/\s/g, ''))) { showToast("El teléfono debe incluir el código de país (ej. +595)", "error"); return; }
  if (emergencyPhone && !phoneRegex.test(emergencyPhone.replace(/\s/g, ''))) { showToast("El tel. de emergencia debe incluir el código de país (ej. +595)", "error"); return; }

  const username = document.getElementById('pub-username').value.trim();
  const password = document.getElementById('pub-password').value;
  const role = document.getElementById('pub-role').value;
  const usernameIsDisabled = document.getElementById('pub-username').disabled;
  
  if (!firstName || !lastName) { showToast('El nombre y apellido son obligatorios.', 'error'); return; }

  const email = username ? username.toLowerCase().replace(/\s+/g, '') + '@ppam.app' : '';
  let partnerName = "";
  if (partnerId) { const pObj = allPublishers.find(p => p.id === partnerId); if (pObj) partnerName = `${pObj.firstName} ${pObj.lastName}`; }
  
  const pubData = { firstName, lastName, gender, status, isTrainer, isShiftManager, partner: partnerId, partnerName, hardPair, maxShifts, phone, notificationEmail, emailNotificationsEnabled, emergencyName, emergencyPhone, availability, absences: currentAbsences, photoUrl: currentEditPhotoUrl || '' };

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
    // Find the linked user document to get the UID for Auth deletion
    const userQuery = await db.collection('users').where('publisherId', '==', id).get();
    let authUid = null;
    let userDocId = null;
    
    if (!userQuery.empty) {
        userDocId = userQuery.docs[0].id;
        authUid = userDocId; // The user doc ID is always the Auth UID
    }

    // 1. If an Auth account exists, delete it via Cloud Function first
    if (authUid) {
        const deleteUserAccount = firebase.functions().httpsCallable('deleteUserAccount');
        await deleteUserAccount({ uid: authUid });
    }

    // 2. Delete the user document
    if (userDocId) {
        await db.collection('users').doc(userDocId).delete();
    }

    // 3. Delete the publisher document
    await db.collection('publishers').doc(id).delete();
    
    showToast("Publicador y cuenta de acceso eliminados.");
    closePubEditModal();
    loadPublishers();
  } catch (error) { 
      showToast("Error al eliminar: " + error.message, "error"); 
      console.error(error);
  }
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
  currentEditPhotoUrl = '';
  renderAdminPubPhotoPreview();
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

async function loadLocations() {
  const listDiv = document.getElementById('locations-list');
  listDiv.innerHTML = '<p style="color:#666; text-align:center;">Cargando ubicaciones...</p>';
  try {
    const snapshot = await db.collection('locations').get();
    if (snapshot.empty) { listDiv.innerHTML = '<p style="color:#666; text-align:center;">No hay ubicaciones registradas.</p>'; return; }
    listDiv.innerHTML = '';
    const generatorLocsDiv = document.getElementById('generator-locations');
    if (generatorLocsDiv) generatorLocsDiv.innerHTML = '';
    allActiveLocationsCache = [];
    
    snapshot.forEach(doc => {
      const loc = doc.data();
      if (loc.isActive !== false) {
        allActiveLocationsCache.push({ ...loc, id: doc.id });
      }
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
var draftSchedule = [];

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
    const allActiveLocs = [];
    locsSnap.forEach(d => { 
        let l = d.data(); l.id = d.id;
        allActiveLocs.push(l);
        if(selectedLocIds.includes(d.id)) {
            locations.push(l); 
        }
    });
    allActiveLocationsCache = allActiveLocs;
    const equivAvailMap = buildEquivalentAvailKeysMap(allActiveLocs);

    const allowSoloFallback = document.getElementById('gen-allow-solo') ? document.getElementById('gen-allow-solo').checked : true;

    function isAbsent(pub, dateString) {
        if (!pub || !pub.absences) return false;
        return pub.absences.some(abs => dateString >= abs.start && dateString <= abs.end);
    }

    function isPreferredPartner(pubA, pubB) {
        if (!pubA || !pubB) return false;
        return pubA.partner === pubB.id || pubB.partner === pubA.id;
    }

    // Seed trackers from existing draftSchedule so batch generation respects existing assignments
    let assignedCounts = {};
    let assignedDates = {};
    let pairCounts = {};
    const existingShiftKeys = new Set();

    function getPairKey(idA, idB) {
        return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
    }
    function getPairCount(idA, idB) {
        return pairCounts[getPairKey(idA, idB)] || 0;
    }
    function recordPair(idA, idB) {
        if (!idA || !idB || idA === "Disponible" || idB === "Disponible") return;
        const key = getPairKey(idA, idB);
        pairCounts[key] = (pairCounts[key] || 0) + 1;
    }
    function assignPublisherToTask(task, pub) {
        task.assigned.push(pub);
        assignedCounts[pub.id] = (assignedCounts[pub.id] || 0) + 1;
        if (!assignedDates[pub.id]) assignedDates[pub.id] = new Set();
        assignedDates[pub.id].add(task.dateString);
        // If this completes a pair on the shift, record the pair history
        if (task.assigned.length % 2 === 0) {
            const prevPub = task.assigned[task.assigned.length - 2];
            if (prevPub && prevPub.id && prevPub.id !== "Disponible") {
                recordPair(prevPub.id, pub.id);
            }
        }
    }

    if (Array.isArray(draftSchedule)) {
        draftSchedule.forEach(s => {
            existingShiftKeys.add(`${s.dateString}_${s.locationId}_${s.time}`);
            const validPubs = (s.assigned || []).filter(p => p && p.id && p.id !== "Disponible");
            validPubs.forEach(p => {
                assignedCounts[p.id] = (assignedCounts[p.id] || 0) + 1;
                if (!assignedDates[p.id]) assignedDates[p.id] = new Set();
                assignedDates[p.id].add(s.dateString);
            });
            for (let i = 0; i + 1 < validPubs.length; i += 2) {
                recordPair(validPubs[i].id, validPubs[i + 1].id);
            }
        });
    }

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
            const timeStr = `${t.startTime}-${t.endTime}`;
            const shiftUniqueKey = `${dateString}_${loc.id}_${timeStr}`;
            if (!existingShiftKeys.has(shiftUniqueKey)) {
              shiftTasks.push({
                docId: null, dateObj: new Date(currentDate), dateString: dateString, 
                location: loc.name, 
                locationId: loc.id, 
                requiresManager: loc.requiresManager || false,
                time: timeStr,
                capacity: loc.capacity, 
                availKey: `${loc.id}_${t.day}_${t.startTime}`, 
                pool: [], assigned: []
              });
            }
          }
        });
      });
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (shiftTasks.length === 0) {
        showToast("Todos los turnos de este rango y ubicación ya existen en el borrador.", "info");
        return;
    }

    // Populate each shift task's pool ONLY with publishers who are approved and actually available on that specific date (including sibling locations)
    allPublishers.forEach(pub => {
      if (pub.status === 'Entrenamiento') return;
      shiftTasks.forEach(task => {
        if (!isPubAvailableForSlot(pub, task.availKey, equivAvailMap)) return;
        if (isAbsent(pub, task.dateString)) return;
        // If publisher has a strict hardPair, verify their partner is also approved, available for this slot, and not absent on this date
        if (pub.hardPair && pub.partner) {
          const strictPartner = allPublishers.find(p => p.id === pub.partner);
          if (!strictPartner || strictPartner.status === 'Entrenamiento') return;
          if (!isPubAvailableForSlot(strictPartner, task.availKey, equivAvailMap)) return;
          if (isAbsent(strictPartner, task.dateString)) return;
        }
        task.pool.push(pub);
      });
    });

    // Sort shifts by effective scarcity (fewest actually eligible publishers first)
    shiftTasks.sort((a, b) => (a.pool.length - b.pool.length) || (a.dateObj - b.dateObj));

    // Pre-calculate effective monthly availability and random tie-breaker
    let totalAvailability = {};
    let randomTieBreakers = {};
    allPublishers.forEach(pub => {
        totalAvailability[pub.id] = shiftTasks.filter(task => task.pool.some(p => p.id === pub.id)).length;
        randomTieBreakers[pub.id] = Math.random();
    });

    function canAssign(pubId, dateObj, dateString) {
      let pub = allPublishers.find(p => p.id === pubId);
      if (!pub) return false;
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

    function canAssignAsSoftPartner(candidate, partnerPub, task) {
      if (!candidate || candidate.id === partnerPub.id) return false;
      if (task.assigned.some(a => a.id === candidate.id)) return false;
      if (!canAssign(candidate.id, task.dateObj, task.dateString)) return false;
      // If candidate has hardPair, they can only be paired with their strict partner
      if (candidate.hardPair && candidate.partner && candidate.partner !== partnerPub.id) return false;
      return true;
    }

    // Sorting utility to balance shifts, space them out, and rotate partners when partnerForId is provided
    function sortCandidatesByPriority(candidates, dateObj, partnerForId = null) {
        return candidates.sort((a, b) => {
            // 0. If pairing with a specific person (random same-gender), prefer someone they haven't worked with repeatedly
            if (partnerForId) {
                const pairA = getPairCount(partnerForId, a.id);
                const pairB = getPairCount(partnerForId, b.id);
                if (pairA !== pairB) {
                    return pairA - pairB;
                }
            }

            // 1. Lowest current shift count
            const countA = assignedCounts[a.id] || 0;
            const countB = assignedCounts[b.id] || 0;
            if (countA !== countB) {
                return countA - countB;
            }

            // 2. Lowest overall availability (prioritize people with fewer available slots)
            const availA = totalAvailability[a.id] || 0;
            const availB = totalAvailability[b.id] || 0;
            if (availA !== availB) {
                return availA - availB;
            }

            // 3. Maximum distance between shifts
            function getMinDistanceToShift(pubId, targetTime) {
                const dates = assignedDates[pubId];
                if (!dates || dates.size === 0) return Infinity; // No shifts yet, max distance

                let minDistance = Infinity;
                dates.forEach(dateStr => {
                    const shiftTime = new Date(dateStr + "T00:00:00").getTime();
                    const distance = Math.abs(shiftTime - targetTime);
                    if (distance < minDistance) {
                        minDistance = distance;
                    }
                });
                return minDistance;
            }

            const targetTime = dateObj.getTime();
            const distA = getMinDistanceToShift(a.id, targetTime);
            const distB = getMinDistanceToShift(b.id, targetTime);

            if (distA !== distB) {
                // Higher distance is better (we want to space them out)
                return distB - distA;
            }

            // 4. Random tie-breaker (to avoid alphabetical bias)
            const tieA = randomTieBreakers[a.id] !== undefined ? randomTieBreakers[a.id] : Math.random();
            const tieB = randomTieBreakers[b.id] !== undefined ? randomTieBreakers[b.id] : Math.random();
            return tieA - tieB;
        });
    }

    function findBestPartnerFor(person, task) {
        // 1. Strict Hard Pair
        if (person.hardPair && person.partner) {
            return task.pool.find(p =>
                p.id === person.partner &&
                !task.assigned.some(a => a.id === p.id) &&
                canAssign(p.id, task.dateObj, task.dateString)
            ) || null;
        }
        // 2. Two-Way Preferred Partner (Soft Pair, bypasses gender rule)
        const preferredMatches = task.pool.filter(p =>
            isPreferredPartner(person, p) &&
            canAssignAsSoftPartner(p, person, task)
        );
        if (preferredMatches.length > 0) {
            sortCandidatesByPriority(preferredMatches, task.dateObj);
            return preferredMatches[0];
        }
        // 3. Same-Gender Solo Partner (with Partner Variety)
        const sameGenderMatches = task.pool.filter(p =>
            p.id !== person.id &&
            p.gender === person.gender &&
            !p.hardPair &&
            !task.assigned.some(a => a.id === p.id) &&
            canAssign(p.id, task.dateObj, task.dateString)
        );
        if (sameGenderMatches.length > 0) {
            sortCandidatesByPriority(sameGenderMatches, task.dateObj, person.id);
            return sameGenderMatches[0];
        }
        return null;
    }

    // 1. First Pass: Assign Required Local Managers
    shiftTasks.forEach(task => {
        if (task.requiresManager && task.assigned.length < task.capacity) {
            const eligibleManagers = task.pool.filter(p => {
                if (!p.isShiftManager || !canAssign(p.id, task.dateObj, task.dateString)) return false;
                // Respect strict Hard Pair for managers
                if (p.hardPair && p.partner) {
                    if (task.capacity - task.assigned.length < 2) return false;
                    const strictPartner = task.pool.find(sp => sp.id === p.partner && canAssign(sp.id, task.dateObj, task.dateString));
                    if (!strictPartner) return false;
                }
                // If solo fallback is disabled, require that the manager has at least one valid partner when capacity >= 2
                if (!allowSoloFallback && (task.capacity - task.assigned.length >= 2)) {
                    if (!findBestPartnerFor(p, task)) return false;
                }
                return true;
            });

            // Prefer managers who have a valid partner available so we avoid incomplete pairs whenever possible
            eligibleManagers.sort((a, b) => {
                const hasPartnerA = findBestPartnerFor(a, task) ? 1 : 0;
                const hasPartnerB = findBestPartnerFor(b, task) ? 1 : 0;
                if (hasPartnerA !== hasPartnerB) return hasPartnerB - hasPartnerA;
                return sortCandidatesByPriority([a, b], task.dateObj)[0].id === a.id ? -1 : 1;
            });

            const manager = eligibleManagers.length > 0 ? eligibleManagers[0] : null;
            
            if (manager) {
                const partner = (task.capacity - task.assigned.length >= 2) ? findBestPartnerFor(manager, task) : null;
                assignPublisherToTask(task, manager);
                if (task.assigned.length < task.capacity) {
                    if (partner) {
                        assignPublisherToTask(task, partner);
                    } else {
                        task.assigned.push({ id: "Disponible" });
                    }
                }
            }
        }
    });

    // 2. Second Pass: Fill remaining spots in pairs (2-by-2)
    shiftTasks.forEach(task => {
        while (task.assigned.length < task.capacity) {
            // If length is odd, complete the pair with the last assigned person
            if (task.assigned.length % 2 !== 0) {
                const lastAssigned = task.assigned[task.assigned.length - 1];
                
                if (lastAssigned.id === "Disponible" || !lastAssigned.gender) {
                    task.assigned.push({ id: "Disponible" });
                    continue;
                }

                const partnerMatch = findBestPartnerFor(lastAssigned, task);
                if (partnerMatch) {
                    assignPublisherToTask(task, partnerMatch);
                } else {
                    task.assigned.push({ id: "Disponible" });
                }
            } 
            // If length is even, we are starting a NEW pair
            else {
                let nextPerson = null;
                let partnerMatch = null;
                
                // Priority 1: Find ANY person who has a valid available partner (Hard Pair, 2-way Soft Pair, or Same Gender)
                const eligiblePairStarters = task.pool.filter(p => {
                    if (task.assigned.some(a => a.id === p.id) || !canAssign(p.id, task.dateObj, task.dateString)) return false;
                    return findBestPartnerFor(p, task) !== null;
                });

                if (eligiblePairStarters.length > 0) {
                    sortCandidatesByPriority(eligiblePairStarters, task.dateObj);
                    nextPerson = eligiblePairStarters[0];
                    partnerMatch = findBestPartnerFor(nextPerson, task);
                }

                // If no complete pair is possible, optionally fallback to 1 solo publisher + "Disponible"
                if (!nextPerson && allowSoloFallback) {
                    const eligibleNextPersons = task.pool.filter(p => 
                        !task.assigned.some(a => a.id === p.id) && 
                        canAssign(p.id, task.dateObj, task.dateString) &&
                        !p.hardPair // Never assign a hardPair publisher solo
                    );
                    sortCandidatesByPriority(eligibleNextPersons, task.dateObj);
                    nextPerson = eligibleNextPersons.length > 0 ? eligibleNextPersons[0] : null;
                }

                if (!nextPerson) {
                    // Pool is exhausted (or solo fallback is disabled), pad the rest of the shift with 'Disponible'
                    while (task.assigned.length < task.capacity) {
                        task.assigned.push({ id: "Disponible" });
                    }
                    break;
                }

                assignPublisherToTask(task, nextPerson);

                if (task.assigned.length < task.capacity) {
                    if (partnerMatch) {
                        assignPublisherToTask(task, partnerMatch);
                    } else {
                        task.assigned.push({ id: "Disponible" });
                    }
                }
            }
        }
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
    assignedContainer.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:12px; border-radius:8px; border:1px solid #eee;"><span>${pub.firstName} ${pub.lastName || ''} ${warn}</span><button type="button" onclick="manualRemove(${shiftIndex}, '${pub.id}')" class="btn-action btn-danger" style="padding:6px 12px;">Quitar</button></div>`;
  });
  
  const select = document.getElementById('shift-add-select');
  let optionsHtml = `<option value="">Seleccionar publicador...</option>`;
  let availableHtml = `<optgroup label="✅ Disponibles (Aprobados)">`; 
  let traineeHtml = `<optgroup label="⚠️ En Entrenamiento (Asignar Manualmente)">`; 
  let unavailableHtml = `<optgroup label="❌ No Disponibles / Ausentes">`;
  
  const daysMap = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // JS getDay is 0=Sun, we need to map to string
  const shiftDateObj = new Date(shift.dateString + 'T00:00:00');
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][shiftDateObj.getDay()];
  const availKey = `${shift.locationId}_${dayName}_${shift.time.split('-')[0]}`;

  const sortedPubs = [...allPublishers].sort((a,b) => (a.firstName || '').localeCompare(b.firstName || ''));
  sortedPubs.forEach(pub => {
    if(shift.assigned.find(p => p.id === pub.id)) return;
    
    let isAway = false;
    if(pub.absences) { isAway = pub.absences.some(abs => shift.dateString >= abs.start && shift.dateString <= abs.end); }

    const isAvailableInProfile = isPubAvailableForSlot(pub, availKey);

    if (isAway) {
        unavailableHtml += `<option value="${pub.id}">✈️ ${pub.firstName} ${pub.lastName || ''} (Vacaciones)</option>`;
    } else if (pub.status === 'Entrenamiento') {
        traineeHtml += `<option value="${pub.id}">⚠️ ${pub.firstName} ${pub.lastName}</option>`;
    } else if(isAvailableInProfile) { 
        availableHtml += `<option value="${pub.id}">✅ ${pub.firstName} ${pub.lastName}</option>`; 
    } else { 
        unavailableHtml += `<option value="${pub.id}">❌ ${pub.firstName} ${pub.lastName || ''}</option>`;
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
    
    // Ensure publishers are loaded before resolving draft shift participant IDs
    if (!allPublishers || allPublishers.length === 0) {
        await loadPublishers();
    }

    // Fetch locations to know which ones require a manager and populate active locations cache
    const locsSnap = await db.collection('locations').get();
    const locMap = {};
    const activeLocs = [];
    locsSnap.forEach(d => {
        const lData = d.data();
        const info = { id: d.id, requiresManager: lData.requiresManager || false };
        locMap[lData.name] = info;
        locMap[d.id] = info;
        if (lData.isActive !== false) {
            activeLocs.push({ ...lData, id: d.id });
        }
    });
    allActiveLocationsCache = activeLocs;
    
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
            
            const locRequiresManager = (data.locationId && locMap[data.locationId]?.requiresManager) || locMap[data.location]?.requiresManager || false;
            
            draftSchedule.push({
                docId: doc.id,
                dateObj: new Date(data.date + 'T00:00:00'),
                dateString: data.date,
                location: data.location,
                locationId: data.locationId,
                time: data.time,
                capacity: data.capacity,
                participantIds: data.participants || [],
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

async function adminResetPassword() {
  const newPassword = document.getElementById('pub-password').value;
  if (!newPassword || newPassword.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
  }
  
  if (!currentLinkedUserDocId) {
      showToast("No hay una cuenta vinculada para restablecer.", "error");
      return;
  }
  
  const isConfirmed = await showConfirm(`¿Estás seguro de forzar el cambio de contraseña para este usuario?`, "Restablecer Contraseña");
  if (!isConfirmed) return;
  
  const btn = document.getElementById('btn-reset-pw');
  btn.innerText = "Cambiando..."; btn.disabled = true;
  
  try {
      const resetUserPassword = firebase.functions().httpsCallable('resetUserPassword');
      await resetUserPassword({ uid: currentLinkedUserDocId, newPassword: newPassword });
      showToast("Contraseña actualizada exitosamente.");
      document.getElementById('pub-password').value = '';
  } catch (error) {
      showToast("Error al restablecer: " + error.message, "error");
      console.error(error);
  } finally {
      btn.innerText = "Restablecer"; btn.disabled = false;
  }
}

// --- DRAFT STATISTICS ---
function openDraftStatsModal() {
  if (!draftSchedule || draftSchedule.length === 0) {
      showToast("No hay turnos en el borrador para analizar.", "error");
      return;
  }

  let totalShifts = draftSchedule.length;
  let emptySpots = 0;
  let pubCounts = {};

  // Find all availability keys present in the current draft schedule
  const draftAvailKeys = new Set();
  const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  draftSchedule.forEach(shift => {
      const shiftDateObj = new Date(shift.dateString + 'T00:00:00');
      const dayName = daysMap[shiftDateObj.getDay()];
      const startTime = shift.time.split('-')[0].trim();
      draftAvailKeys.add(`${shift.locationId}_${dayName}_${startTime}`);
  });

  // Initialize counts for active publishers who are actually available for the drafted shifts (including sibling locations)
  const equivMap = buildEquivalentAvailKeysMap(allActiveLocationsCache);
  allPublishers.forEach(pub => {
      if (pub.status !== 'Entrenamiento') { // Exclude trainees from stats as they are manually handled
          const isAvailableForDraft = Array.from(draftAvailKeys).some(availKey => isPubAvailableForSlot(pub, availKey, equivMap));
          if (isAvailableForDraft) {
              pubCounts[pub.id] = 0;
          }
      }
  });

  // Count assignments and empty spots
  draftSchedule.forEach(shift => {
      const assignedCount = shift.assigned.filter(p => p.id && p.id !== "Disponible").length;
      emptySpots += (shift.capacity - assignedCount);

      shift.assigned.forEach(p => {
          if (p.id && p.id !== "Disponible" && pubCounts[p.id] !== undefined) {
              pubCounts[p.id]++;
          }
      });
  });

  // Calculate Distribution
  const distribution = { 0: [], 1: [], 2: [], 3: [], 4: [], '5+': [] };

  Object.keys(pubCounts).forEach(pubId => {
      const count = pubCounts[pubId];
      const pub = allPublishers.find(p => p.id === pubId);
      if (!pub) return;

      if (count === 0) distribution[0].push(pub);
      else if (count === 1) distribution[1].push(pub);
      else if (count === 2) distribution[2].push(pub);
      else if (count === 3) distribution[3].push(pub);
      else if (count === 4) distribution[4].push(pub);
      else distribution['5+'].push(pub);
  });

  // Populate Header
  document.getElementById('stat-total-shifts').innerText = totalShifts;
  document.getElementById('stat-empty-spots').innerText = emptySpots;

  // Build Distribution Bars
  const distContainer = document.getElementById('stat-distribution-bars');
  distContainer.innerHTML = '';

  const maxGroupSize = Math.max(...Object.values(distribution).map(arr => arr.length)) || 1; // Prevent division by zero

  ['0', '1', '2', '3', '4', '5+'].forEach(key => {
      const count = distribution[key].length;
      const pct = (count / maxGroupSize) * 100;
      const barColor = key === '0' || key === '1' ? '#dc3545' : '#5d7aa9';

      distContainer.innerHTML += `
        <div style="display:flex; align-items:center; margin-bottom:8px;">
            <span style="width:70px; font-weight:600; color:#555;">${key} turnos:</span>
            <div style="flex:1; background:#ddd; height:12px; border-radius:6px; overflow:hidden; margin:0 10px;">
                <div style="width:${pct}%; background:${barColor}; height:100%; transition: width 0.5s;"></div>
            </div>
            <span style="width:30px; text-align:right; color:#333; font-weight:bold;">${count}</span>
        </div>
      `;
  });

  // Build "Needs Attention" List
  const attentionList = document.getElementById('stat-attention-list');
  attentionList.innerHTML = '';

  const needyPubs = [...distribution[0], ...distribution[1]].sort((a,b) => (a.firstName || '').localeCompare(b.firstName || ''));
  if (needyPubs.length === 0) {
      attentionList.innerHTML = '<li style="list-style:none; color:#28a745; font-weight:bold;">✅ ¡Excelente! Todos los publicadores aprobados tienen al menos 2 turnos.</li>';
  } else {
      needyPubs.forEach(pub => {
          const shiftCount = pubCounts[pub.id];
          const badge = shiftCount === 0 ? `<span style="background:#dc3545; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-left:5px;">0 Turnos</span>` : `<span style="background:#f59f00; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-left:5px;">1 Turno</span>`;
          attentionList.innerHTML += `<li style="margin-bottom:5px;"><strong>${pub.firstName} ${pub.lastName || ''}</strong> ${badge}</li>`;
      });
  }

  document.getElementById('stats-modal').style.display = 'flex';
}

function closeDraftStatsModal() {
    document.getElementById('stats-modal').style.display = 'none';
}

// ==========================================
// TAB 4: DISPONIBILIDAD
// ==========================================
let availLocationsCache = [];

async function loadAvailabilityLocations() {
    const locSelect = document.getElementById('avail-loc-select');
    locSelect.innerHTML = '<option value="">Cargando ubicaciones...</option>';

    try {
        const snap = await db.collection('locations').where('isActive', '==', true).get();
        availLocationsCache = [];
        snap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            availLocationsCache.push(data);
        });

        locSelect.innerHTML = '<option value="">Selecciona una ubicación</option>';
        availLocationsCache.forEach(loc => {
            locSelect.innerHTML += `<option value="${loc.id}">${loc.name}</option>`;
        });

        document.getElementById('avail-shift-select').innerHTML = '<option value="">Selecciona una ubicación primero</option>';
        document.getElementById('avail-results').style.display = 'none';
    } catch (e) {
        locSelect.innerHTML = '<option value="">Error al cargar ubicaciones</option>';
        console.error(e);
    }
}

function loadAvailabilityShifts() {
    const locId = document.getElementById('avail-loc-select').value;
    const shiftSelect = document.getElementById('avail-shift-select');

    if (!locId) {
        shiftSelect.innerHTML = '<option value="">Selecciona una ubicación primero</option>';
        document.getElementById('avail-results').style.display = 'none';
        return;
    }

    const loc = availLocationsCache.find(l => l.id === locId);
    if (!loc || !loc.templates || loc.templates.length === 0) {
        shiftSelect.innerHTML = '<option value="">No hay turnos para esta ubicación</option>';
        document.getElementById('avail-results').style.display = 'none';
        return;
    }

    shiftSelect.innerHTML = '<option value="">Selecciona un turno</option>';

    // Sort templates by day and then time for better UX
    const daysOrder = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Domingo': 7 };
    const sortedTemplates = [...loc.templates].sort((a, b) => {
        if (daysOrder[a.day] !== daysOrder[b.day]) {
            return daysOrder[a.day] - daysOrder[b.day];
        }
        return a.startTime.localeCompare(b.startTime);
    });

    sortedTemplates.forEach(t => {
        const availKey = `${locId}_${t.day}_${t.startTime}`;
        shiftSelect.innerHTML += `<option value="${availKey}">${t.day} | ${t.startTime} - ${t.endTime}</option>`;
    });

    document.getElementById('avail-results').style.display = 'none';
}

function checkAvailability() {
    const availKey = document.getElementById('avail-shift-select').value;
    if (!availKey) {
        document.getElementById('avail-results').style.display = 'none';
        return;
    }

    const equivMap = buildEquivalentAvailKeysMap(availLocationsCache);
    const availablePubs = allPublishers.filter(pub =>
        pub.status !== 'Entrenamiento' &&
        isPubAvailableForSlot(pub, availKey, equivMap)
    );

    availablePubs.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));

    document.getElementById('avail-count').innerText = availablePubs.length;

    const listDiv = document.getElementById('avail-list');
    listDiv.innerHTML = '';

    if (availablePubs.length === 0) {
        listDiv.innerHTML = '<p style="color: #666; font-style: italic;">No hay publicadores disponibles para este turno.</p>';
    } else {
        availablePubs.forEach(pub => {
            listDiv.innerHTML += `
                <div style="background: #f9f9f9; padding: 12px; border: 1px solid #eee; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color:#5d7aa9;">${pub.gender === 'M' ? 'woman' : 'man'}</span>
                    <strong style="color: #333;">${pub.firstName} ${pub.lastName || ''}</strong>
                </div>
            `;
        });
    }

    document.getElementById('avail-results').style.display = 'block';
}

// ==========================================
// PUBLISHER SHIFT & CANCELLATION HISTORY + TAB 5: INFORMES
// ==========================================
let adminShiftsCache = [];

function isAdminShiftFinished(shift) {
    if (!shift || !shift.date) return false;
    const parts = (shift.time || '').split('-');
    const endTime = (parts[1] || parts[0] || '23:59').trim();
    const shiftEndDate = new Date(`${shift.date}T${endTime}:00`);
    if (isNaN(shiftEndDate.getTime())) {
        const todayStr = formatDate(new Date());
        return shift.date < todayStr;
    }
    return shiftEndDate <= new Date();
}

function getPublisherNameById(id) {
    const p = allPublishers.find(x => x.id === id);
    return p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Desconocido';
}

function getReportForPublisherShift(pub, shift) {
    if (!pub || !shift) return null;
    if (pub.shiftReports && pub.shiftReports[shift.id]) {
        return pub.shiftReports[shift.id];
    }
    if (shift.reports && shift.reports[pub.id]) {
        return shift.reports[pub.id];
    }
    return null;
}

async function loadPublisherShiftHistory(pub) {
    const historyContainer = document.getElementById('view-pub-history-container');
    try {
        const shiftsSnap = await db.collection('shifts').orderBy('date', 'desc').get();
        adminShiftsCache = [];
        shiftsSnap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            adminShiftsCache.push(d);
        });

        const assignedShifts = adminShiftsCache.filter(s => Array.isArray(s.participants) && s.participants.includes(pub.id));
        let totalInteractions = 0;

        assignedShifts.forEach(s => {
            const rep = getReportForPublisherShift(pub, s);
            if (rep && typeof rep.interactions === 'number') {
                totalInteractions += rep.interactions;
            }
        });

        // Build unified cancellation entries (preserving legacy lastCancelledShift if present)
        const cancelEntries = [];
        const seenCancelKeys = new Set();

        if (Array.isArray(pub.cancellationHistory)) {
            pub.cancellationHistory.forEach(item => {
                const key = `${item.shiftId || 'legacy'}__${item.cancelledAt || item.date || ''}`;
                if (!seenCancelKeys.has(key)) {
                    seenCancelKeys.add(key);
                    cancelEntries.push(item);
                }
            });
        }

        // Also check shifts with cancelledParticipants in case any were logged there
        adminShiftsCache.forEach(s => {
            if (Array.isArray(s.cancelledParticipants)) {
                s.cancelledParticipants.forEach(cp => {
                    if (cp.publisherId === pub.id) {
                        const key = `${s.id}__${cp.cancelledAt || s.date || ''}`;
                        if (!seenCancelKeys.has(key)) {
                            seenCancelKeys.add(key);
                            cancelEntries.push({
                                shiftId: s.id,
                                date: s.date,
                                time: s.time,
                                location: s.location,
                                cancelledAt: cp.cancelledAt
                            });
                        }
                    }
                });
            }
        });

        // If legacy lastCancelledShift exists and isn't already represented in cancelEntries, include it
        if (pub.lastCancelledShift) {
            const alreadyIncluded = cancelEntries.some(c => c.cancelledAt === pub.lastCancelledShift);
            if (!alreadyIncluded) {
                cancelEntries.push({
                    shiftId: 'legacy',
                    date: pub.lastCancelledShift.split('T')[0],
                    time: '',
                    location: 'Cancelación registrada anteriormente',
                    cancelledAt: pub.lastCancelledShift,
                    isLegacy: true
                });
            }
        }

        const totalCancelCount = Math.max(getPublisherCancelCount(pub), cancelEntries.length);

        document.getElementById('view-pub-shifts-count').innerText = assignedShifts.length;
        document.getElementById('view-pub-cancels-count').innerText = totalCancelCount;
        document.getElementById('view-pub-interactions-count').innerText = totalInteractions;

        const timelineItems = [];

        assignedShifts.forEach(s => {
            const finished = isAdminShiftFinished(s);
            const others = (s.participants || []).filter(uid => uid && uid !== 'Disponible' && uid !== pub.id).map(uid => getPublisherNameById(uid));
            const partnerStr = others.length > 0 ? others.join(', ') : 'Solo/a';
            const myReport = getReportForPublisherShift(pub, s);
            timelineItems.push({
                type: 'shift',
                sortDate: s.date || '',
                shift: s,
                finished: finished,
                partnerStr: partnerStr,
                report: myReport
            });
        });

        cancelEntries.forEach(c => {
            const sortDate = c.date || (c.cancelledAt ? c.cancelledAt.split('T')[0] : '');
            timelineItems.push({
                type: 'cancel',
                sortDate: sortDate,
                cancel: c
            });
        });

        timelineItems.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));

        if (timelineItems.length === 0) {
            historyContainer.innerHTML = '<p style="margin: 0; color: #666; font-size: 0.9em; text-align: center; font-style: italic;">No hay turnos ni cancelaciones registradas para este publicador.</p>';
            return;
        }

        historyContainer.innerHTML = '';
        timelineItems.forEach(item => {
            const row = document.createElement('div');
            if (item.type === 'cancel') {
                const c = item.cancel;
                const cancelDetails = c.isLegacy
                    ? `<div style="font-size: 0.85em; color: #721c24;">Fecha/hora de cancelación: <strong>${formatIsoTimestamp(c.cancelledAt)}</strong></div>`
                    : `<div style="font-size: 0.88em; color: #444;"><strong>${c.location || 'Ubicación'}</strong> • ${formatSpanishDate(c.date)} ${c.time ? `(${c.time})` : ''}</div>
                       <div style="font-size: 0.8em; color: #721c24; margin-top: 2px;">Cancelado el ${formatIsoTimestamp(c.cancelledAt)}</div>`;
                row.style.cssText = 'background: #fff5f5; border: 1px solid #f5c6cb; border-left: 4px solid #dc3545; border-radius: 6px; padding: 10px 12px;';
                row.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="color: #dc3545; font-size: 0.9em; display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 16px;">cancel</span> Turno Cancelado
                        </strong>
                        <span class="badge-red" style="margin: 0;">Cancelación</span>
                    </div>
                    ${cancelDetails}
                `;
            } else {
                const s = item.shift;
                const badgeHtml = item.finished
                    ? `<span class="badge-green" style="margin: 0;">Completado</span>`
                    : `<span class="badge-blue" style="margin: 0;">Próximo</span>`;
                let reportHtml = '';
                if (item.report) {
                    reportHtml = `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #dce4ee; font-size: 0.85em; color: #155724;">
                            <strong>📋 Informe:</strong> ${item.report.interactions ?? 0} interacciones
                            ${item.report.comments ? `<div style="font-style: italic; color: #333; margin-top: 3px;">"${item.report.comments}"</div>` : ''}
                        </div>
                    `;
                }
                row.style.cssText = 'background: white; border: 1px solid #e4e9f0; border-left: 4px solid ' + (item.finished ? '#28a745' : '#5d7aa9') + '; border-radius: 6px; padding: 10px 12px;';
                row.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <strong style="color: #2c5282; font-size: 0.92em;">${formatSpanishDate(s.date)} • ${s.time}</strong>
                        ${badgeHtml}
                    </div>
                    <div style="font-size: 0.86em; color: #444; margin-top: 4px;">
                        <strong>📍 ${s.location}</strong> &nbsp;|&nbsp; 👥 Con: ${item.partnerStr}
                    </div>
                    ${reportHtml}
                `;
            }
            historyContainer.appendChild(row);
        });
    } catch (e) {
        console.error("Error loading publisher shift history:", e);
        historyContainer.innerHTML = '<p style="margin: 0; color: #dc3545; font-size: 0.9em; text-align: center;">Error al cargar el historial.</p>';
    }
}

async function loadShiftReports() {
    const container = document.getElementById('reports-list-container');
    if (!container) return;
    container.innerHTML = '<p style="color: #666; text-align: center;">Cargando informes de turno...</p>';

    try {
        const [pubSnap, shiftsSnap] = await Promise.all([
            db.collection('publishers').orderBy('firstName').get(),
            db.collection('shifts').orderBy('date', 'desc').get()
        ]);

        allPublishers = [];
        pubSnap.forEach(doc => {
            const p = doc.data();
            p.id = doc.id;
            allPublishers.push(p);
        });

        adminShiftsCache = [];
        const monthsSet = new Set();

        shiftsSnap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            adminShiftsCache.push(d);
            if (d.date && d.date.length >= 7) {
                monthsSet.add(d.date.substring(0, 7));
            }
        });

        const monthSelect = document.getElementById('rep-month-filter');
        const currentSelectedMonth = monthSelect ? monthSelect.value : '';
        if (monthSelect) {
            const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            monthSelect.innerHTML = '<option value="">Todos los meses</option>';
            Array.from(monthsSet).sort().reverse().forEach(ym => {
                const [y, m] = ym.split('-');
                const mName = monthNames[parseInt(m, 10) - 1] || m;
                const sel = ym === currentSelectedMonth ? 'selected' : '';
                monthSelect.innerHTML += `<option value="${ym}" ${sel}>${mName} ${y}</option>`;
            });
        }

        renderShiftReports();
    } catch (e) {
        console.error("Error loading shift reports:", e);
        container.innerHTML = '<p style="color: #dc3545; text-align: center;">Error al cargar los informes.</p>';
    }
}

function renderShiftReports() {
    const container = document.getElementById('reports-list-container');
    if (!container) return;

    const monthFilter = (document.getElementById('rep-month-filter')?.value || '').trim();
    const statusFilter = document.getElementById('rep-status-filter')?.value || 'all';
    const searchQuery = (document.getElementById('rep-search-input')?.value || '').toLowerCase().trim();

    const submittedEntries = [];
    const pendingShifts = [];

    // Index all publisher shiftReports by shiftId -> { [pubId]: report }
    const pubReportsByShiftId = {};
    allPublishers.forEach(pub => {
        if (pub.shiftReports && typeof pub.shiftReports === 'object') {
            Object.keys(pub.shiftReports).forEach(sId => {
                if (!pubReportsByShiftId[sId]) pubReportsByShiftId[sId] = {};
                pubReportsByShiftId[sId][pub.id] = pub.shiftReports[sId];
            });
        }
    });

    adminShiftsCache.forEach(shift => {
        if (monthFilter && (!shift.date || !shift.date.startsWith(monthFilter))) {
            return;
        }

        const combinedReportsMap = {
            ...(shift.reports || {}),
            ...(pubReportsByShiftId[shift.id] || {})
        };
        const reportKeys = Object.keys(combinedReportsMap);
        const realParticipants = (shift.participants || []).filter(id => id && id !== 'Disponible');

        if (reportKeys.length > 0) {
            reportKeys.forEach(pubId => {
                const rep = combinedReportsMap[pubId];
                const pubName = rep.publisherName || getPublisherNameById(pubId);
                const partners = realParticipants.filter(id => id !== pubId).map(id => getPublisherNameById(id));
                const partnerText = partners.length > 0 ? partners.join(', ') : (rep.partnerText || 'Solo/a');
                submittedEntries.push({
                    shift: shift,
                    publisherId: pubId,
                    publisherName: pubName,
                    partnerText: partnerText,
                    interactions: Number(rep.interactions) || 0,
                    comments: (rep.comments || '').trim(),
                    updatedAt: rep.updatedAt || ''
                });
            });
        } else if (isAdminShiftFinished(shift) && realParticipants.length > 0) {
            const participantNames = realParticipants.map(id => getPublisherNameById(id)).join(', ');
            pendingShifts.push({
                shift: shift,
                participantNames: participantNames
            });
        }
    });

    // Update KPIs based on submitted reports matching month & search query
    const filteredSubmittedForKpi = submittedEntries.filter(entry => {
        if (!searchQuery) return true;
        const haystack = `${entry.publisherName} ${entry.partnerText} ${entry.shift.location} ${entry.shift.date} ${formatSpanishDate(entry.shift.date)} ${entry.comments}`.toLowerCase();
        return haystack.includes(searchQuery);
    });

    const totalReports = filteredSubmittedForKpi.length;
    const totalInteractions = filteredSubmittedForKpi.reduce((sum, e) => sum + e.interactions, 0);
    const totalWithComments = filteredSubmittedForKpi.filter(e => e.comments.length > 0).length;

    document.getElementById('rep-kpi-total').innerText = totalReports;
    document.getElementById('rep-kpi-interactions').innerText = totalInteractions;
    document.getElementById('rep-kpi-comments').innerText = totalWithComments;

    container.innerHTML = '';

    if (statusFilter === 'pending') {
        const filteredPending = pendingShifts.filter(item => {
            if (!searchQuery) return true;
            const haystack = `${item.participantNames} ${item.shift.location} ${item.shift.date} ${formatSpanishDate(item.shift.date)}`.toLowerCase();
            return haystack.includes(searchQuery);
        });

        if (filteredPending.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 30px; background: #f9f9f9; border-radius: 10px; border: 1px dashed #ccc; color: #666;">No hay turnos finalizados pendientes de informe con este filtro.</div>';
            return;
        }

        filteredPending.forEach(item => {
            const s = item.shift;
            const card = document.createElement('div');
            card.style.cssText = 'background: white; border: 1px solid #eaeaea; border-left: 5px solid #f59f00; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;';
            card.innerHTML = `
                <div>
                    <div style="font-weight: 600; color: #333; font-size: 1.05em;">${formatSpanishDate(s.date)} • ${s.time}</div>
                    <div style="color: #555; font-size: 0.92em; margin-top: 4px;">📍 <strong>${s.location}</strong> &nbsp;|&nbsp; 👥 Asignados: ${item.participantNames}</div>
                </div>
                <span class="badge-warning" style="padding: 6px 12px; font-size: 0.85em;">Sin Informe Aún</span>
            `;
            container.appendChild(card);
        });
        return;
    }

    const displayList = filteredSubmittedForKpi.filter(entry => {
        if (statusFilter === 'comments') return entry.comments.length > 0;
        return true;
    });

    if (displayList.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 30px; background: #f9f9f9; border-radius: 10px; border: 1px dashed #ccc; color: #666;">No se encontraron informes de turno para los filtros seleccionados.</div>';
        return;
    }

    displayList.forEach(entry => {
        const s = entry.shift;
        const card = document.createElement('div');
        card.style.cssText = 'background: white; border: 1px solid #eaeaea; border-left: 5px solid #5d7aa9; border-radius: 10px; padding: 18px 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);';
        const commentBlock = entry.comments
            ? `<div style="margin-top: 12px; background: #f8faff; border: 1px solid #e2eaf5; border-radius: 8px; padding: 12px 15px; color: #2d3748; font-size: 0.95em; line-height: 1.5;">
                 <strong style="color: #5d7aa9; display: block; font-size: 0.82em; text-transform: uppercase; margin-bottom: 4px;">Experiencia / Comentario:</strong>
                 ${entry.comments.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
               </div>`
            : `<div style="margin-top: 8px; font-size: 0.85em; color: #999; font-style: italic;">Sin comentarios adicionales.</div>`;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">
                <div>
                    <h4 style="margin: 0; color: #2c5282; font-size: 1.05em; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 19px; color: #5d7aa9;">event</span>
                        ${formatSpanishDate(s.date)} <span style="color: #666; font-weight: normal; font-size: 0.9em;">(${s.time})</span>
                    </h4>
                    <div style="margin-top: 5px; font-size: 0.92em; color: #444;">
                        📍 <strong>${s.location}</strong> &nbsp;•&nbsp; 👤 Reportado por: <strong>${entry.publisherName}</strong> (Con: ${entry.partnerText})
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="badge-green" style="font-size: 0.9em; padding: 6px 12px;">🤝 ${entry.interactions} ${entry.interactions === 1 ? 'Interacción' : 'Interacciones'}</span>
                </div>
            </div>
            ${commentBlock}
        `;
        container.appendChild(card);
    });
}

// For Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatSpanishDate
    };
}
