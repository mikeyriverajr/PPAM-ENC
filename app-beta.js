// app-beta.js - Complete File
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
const messaging = firebase.messaging(); // Initialize Messaging

let publisherCache = {}; 
let currentUserPublisherId = null;
let currentPubData = null; 
let originalProfileData = {};
let myAbsences = []; 

function openFullSchedule() { document.getElementById('full-schedule-modal').style.display = 'flex'; }
function closeFullSchedule() { document.getElementById('full-schedule-modal').style.display = 'none'; }

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

const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-overlay').style.display = 'none';
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        currentUserPublisherId = userData.publisherId;
        
        const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
        if(pubDoc.exists) {
            currentPubData = pubDoc.data();
        } else {
            console.warn("Cuenta desvinculada.");
            auth.signOut();
            showToast("Tu cuenta fue desvinculada por el administrador. Por favor, vuelve a iniciar sesión.", "error");
            return;
        }
        
        if (userData.requirePasswordChange) {
            document.getElementById('force-password-modal').style.display = 'flex';
            document.getElementById('app-content').style.display = 'none';
        } else {
            document.getElementById('force-password-modal').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            
            const pubSnap = await db.collection('publishers').get();
            pubSnap.forEach(d => { publisherCache[d.id] = `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(); });
            
            document.getElementById('header-user-name').innerText = `| ${publisherCache[currentUserPublisherId] || ""}`;
            
            loadShifts(); loadMyShifts(); loadAvailableShifts(); loadAvailabilityForm(); loadProfileForm(); 
        }
      } else {
        console.warn("Cuenta eliminada.");
        auth.signOut();
        showToast("Tu cuenta fue modificada o desvinculada por el administrador.", "error");
      }
      
    } catch (error) { 
      console.error("Error:", error);
      auth.signOut();
      showToast("Error de conexión. Por favor, vuelve a iniciar sesión.", "error");
    }
  } else {
    document.getElementById('login-overlay').style.display = 'block';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('force-password-modal').style.display = 'none';
    currentUserPublisherId = null;
    currentPubData = null;
  }
});

function handleGatekeeperLogin() {
  const usernameInput = document.getElementById('gate-username').value.trim(); 
  const pass = document.getElementById('gate-password').value;
  const errorDiv = document.getElementById('gate-error');
  errorDiv.innerText = "";
  const email = usernameInput.toLowerCase().replace(/\s+/g, '') + '@ppam.app';
  auth.signInWithEmailAndPassword(email, pass).catch(err => { errorDiv.innerText = "Error: Verifica tu usuario o contraseña."; });
}

function logout() { auth.signOut(); }

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-btn-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

async function submitForcedPassword() {
  const p1 = document.getElementById('force-new-pass1').value;
  const p2 = document.getElementById('force-new-pass2').value;
  const err = document.getElementById('force-pass-error');
  err.innerText = "";
  if (p1.length < 6) { err.innerText = "La contraseña debe tener al menos 6 caracteres."; return; }
  if (p1 !== p2) { err.innerText = "Las contraseñas no coinciden."; return; }

  try {
      const user = auth.currentUser;
      await user.updatePassword(p1);
      await db.collection('users').doc(user.uid).update({ requirePasswordChange: false });
      
      document.getElementById('force-password-modal').style.display = 'none';
      document.getElementById('app-content').style.display = 'block';
      const pubSnap = await db.collection('publishers').get();
      pubSnap.forEach(d => { publisherCache[d.id] = `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(); });
      document.getElementById('header-user-name').innerText = `| ${publisherCache[currentUserPublisherId] || ""}`;
      
      showToast("¡Contraseña creada exitosamente!");
      loadShifts(); loadMyShifts(); loadAvailableShifts(); loadAvailabilityForm(); loadProfileForm(); 
  } catch (error) {
      if(error.code === 'auth/requires-recent-login') { err.innerText = "Por favor cierra sesión y vuelve a ingresar para cambiar tu contraseña."; } 
      else { err.innerText = "Error al actualizar: " + error.message; }
  }
}

function checkPasswordChange() {
    const p = document.getElementById('prof-new-pass').value;
    document.getElementById('btn-update-pass').disabled = p.length < 6;
}

async function changeProfilePassword() {
  const p = document.getElementById('prof-new-pass').value;
  if (p.length < 6) return;
  try {
      await auth.currentUser.updatePassword(p);
      showToast("¡Contraseña actualizada con éxito!");
      document.getElementById('prof-new-pass').value = '';
      checkPasswordChange(); 
  } catch (error) {
      if(error.code === 'auth/requires-recent-login') { showToast("Cierra sesión y vuelve a ingresar antes de cambiar tu contraseña.", "error"); } 
      else { showToast("Error: " + error.message, "error"); }
  }
}

// ==========================================
// PUSH NOTIFICATIONS & CACHE CLEANUP
// ==========================================

// THE HUNTER-KILLER SCRIPT
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            if (!registration.active || !registration.active.scriptURL.includes('firebase-messaging-sw.js')) {
                console.log("Rogue Service Worker detected and destroyed.");
                registration.unregister();
            }
        }
    });
}

async function enablePushNotifications() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            
            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
            
            const token = await messaging.getToken({ 
                vapidKey: 'BCsvQHZK5ybZnRx28iqE5hLKOJeAmIuvNUA62-zJmLxRuJOHySmGeWIRIcN9qMx2-OjGmjlAm09montphPtiBgw',
                serviceWorkerRegistration: registration 
            });
            
            if (token) {
                await db.collection('publishers').doc(currentUserPublisherId).update({ fcmToken: token });
                showToast("¡Notificaciones activadas con éxito!");
                document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#28a745;">Activadas</span>';
                document.getElementById('btn-enable-push').style.display = 'none';
            } else {
                showToast("No se pudo generar el token de notificación.", "error");
            }
        } else {
            showToast("Permiso denegado para notificaciones.", "error");
        }
    } catch (error) {
        console.error("FCM Error:", error);
        showToast("Error al activar notificaciones. Asegúrate de estar en HTTPS o en un celular.", "error");
    }
}

// ==========================================
// FOREGROUND NOTIFICATION LISTENER (UPGRADED)
// ==========================================
if (typeof messaging !== 'undefined') {
    messaging.onMessage((payload) => {
        console.log("Notificación recibida en primer plano:", payload);
        
        // Use the 'info' type to trigger the blue styling for notifications
        showToast(`🔔 ${payload.notification.title} - ${payload.notification.body}`, 'info');
        
        // Smart Refresh: If they have the app open, silently refresh the shifts
        // so the UI matches the new data without requiring a manual refresh!
        if (currentUserPublisherId) {
            loadShifts(); 
            loadMyShifts(); 
            loadAvailableShifts();
        }
    });
}

let allShiftsData = []; 
async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center; color:#666;">Cargando programa...</p>';
  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    container.innerHTML = ''; allShiftsData = [];
    shiftsSnapshot.forEach(doc => { let shift = doc.data(); shift.id = doc.id; allShiftsData.push(shift); });
    renderAllShifts(allShiftsData);
  } catch (error) { container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar el programa.</p>'; }
}

function renderAllShifts(shifts) {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '';
  if(shifts.length === 0) { container.innerHTML = '<p style="text-align:center; color:#666;">No hay turnos programados.</p>'; return; }
  shifts.forEach(shift => {
    const participantNames = (shift.participants || []).map(id => publisherCache[id] || 'Desconocido');
    const shiftCard = document.createElement('div');
    shiftCard.className = 'shift-card';
    shiftCard.innerHTML = `
      <div class="shift-card-header">
        <h4 class="shift-card-title"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px; color: #5d7aa9;">event</span>${formatSpanishDate(shift.date)}</h4>
        <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px; color: #666;">schedule</span>${shift.time}</span>
      </div>
      <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545;">location_on</span> <strong>${shift.location}</strong></p>
      <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> ${participantNames.join(', ')}</p>
    `;
    container.appendChild(shiftCard);
  });
}

function filterAllShifts() {
  const query = document.getElementById('search-all').value.toLowerCase();
  const filtered = allShiftsData.filter(s => {
      const names = (s.participants || []).map(id => publisherCache[id] || '').join(' ').toLowerCase();
      const spanishDate = formatSpanishDate(s.date).toLowerCase();
      return s.location.toLowerCase().includes(query) || s.date.includes(query) || spanishDate.includes(query) || names.includes(query);
  });
  renderAllShifts(filtered);
}

let myCurrentShifts = []; 
async function loadMyShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('mine-container');
  container.innerHTML = '<p style="text-align:center; color:#666;">Buscando tus turnos...</p>';
  try {
    const todayStr = getTodayString();
    const shiftsSnapshot = await db.collection('shifts').where('participants', 'array-contains', currentUserPublisherId).get();
    myCurrentShifts = [];
    shiftsSnapshot.forEach(doc => { 
        let s = doc.data(); s.id = doc.id; 
        if (s.date >= todayStr) myCurrentShifts.push(s); 
    });
    
    if (myCurrentShifts.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 30px 10px; background: white; border-radius: 10px; border: 1px dashed #ccc;"><p style="color:#666; margin:0;">No tienes próximos turnos asignados.</p></div>`;
      return;
    }
    
    container.innerHTML = '';
    myCurrentShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

    myCurrentShifts.forEach(shift => {
      const others = (shift.participants || []).filter(id => id !== currentUserPublisherId).map(id => publisherCache[id] || 'Desconocido');
      const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';
      const shiftCard = document.createElement('div');
      shiftCard.className = 'shift-card mine';
      shiftCard.innerHTML = `
        <div class="shift-card-header">
          <h4 class="shift-card-title" style="color:#2c5282;"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">event</span>${formatSpanishDate(shift.date)}</h4>
          <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">schedule</span>${shift.time}</span>
        </div>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545;">location_on</span> <strong>${shift.location}</strong></p>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> Con: ${partnerText}</p>
        <div class="card-actions">
           <button onclick="attemptCancel('${shift.id}', '${shift.date}', '${shift.time}', '${shift.location}')" class="btn-action btn-danger">Cancelar Turno</button>
        </div>
      `;
      container.appendChild(shiftCard);
    });
  } catch (error) { container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar tus turnos.</p>'; }
}

async function attemptCancel(shiftId, dateStr, timeStr, locationName) {
  const startTime = timeStr.split('-')[0]; 
  const shiftDateTime = new Date(`${dateStr}T${startTime}:00`);
  const now = new Date();
  
  if (((shiftDateTime - now) / (1000 * 60 * 60)) < 24) { showToast("No puedes cancelar con menos de 24 horas. Comunícate con los encargados.", "error"); return; }
  
  const isConfirmed = await showConfirm(`¿Estás seguro de que deseas cancelar tu turno el ${formatSpanishDate(dateStr)}?`, "Cancelar Turno", "#dc3545");
  if(!isConfirmed) return;

  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];
    currentParticipants = currentParticipants.filter(id => id !== currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });
    showToast("Turno cancelado exitosamente.");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { showToast("Error al cancelar: " + err.message, "error"); }
}

async function loadAvailableShifts() {
  if (!currentUserPublisherId || !currentPubData) return;
  const container = document.getElementById('open-shifts-container');
  const banner = document.getElementById('trainee-warning');
  
  const isTrainee = currentPubData.status === 'Entrenamiento';
  banner.style.display = isTrainee ? 'flex' : 'none';
  
  container.innerHTML = '<p style="text-align:center; color:#666;">Buscando espacios libres...</p>';
  try {
    const todayStr = getTodayString();
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    let openShifts = [];
    shiftsSnapshot.forEach(doc => {
      let shift = doc.data(); shift.id = doc.id;
      const capacity = shift.capacity || 2; 
      const participants = shift.participants || [];
      if (participants.length < capacity && !participants.includes(currentUserPublisherId) && shift.date >= todayStr) {
          openShifts.push(shift);
      }
    });

    if (openShifts.length === 0) { container.innerHTML = '<div style="text-align:center; padding: 30px 10px; background: white; border-radius: 10px; border: 1px dashed #ccc;"><p style="color:#666; margin:0;">No hay turnos libres en este momento.</p></div>'; return; }

    container.innerHTML = '';
    openShifts.forEach(shift => {
      const names = (shift.participants || []).map(id => publisherCache[id] || 'Alguien').join(', ') || 'Vacío';
      const capacity = shift.capacity || 2;
      const availableSpots = capacity - (shift.participants || []).length;
      
      const card = document.createElement('div');
      card.className = 'shift-card open';
      
      const actionButton = isTrainee 
        ? `<button disabled class="btn-action" style="background:#e9ecef; color:#888; cursor:not-allowed; border: 1px solid #ddd;">Requiere Aprobación</button>`
        : `<button onclick="claimShift('${shift.id}', '${shift.date}', '${shift.time}', ${capacity})" class="btn-action btn-success"><span class="material-symbols-outlined" style="font-size:18px;">add</span> Tomar Turno</button>`;

      card.innerHTML = `
        <div class="shift-card-header">
          <h4 class="shift-card-title" style="color:#28a745;"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">event</span>${formatSpanishDate(shift.date)}</h4>
          <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">schedule</span>${shift.time}</span>
        </div>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545;">location_on</span> <strong>${shift.location}</strong></p>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> Actuales: ${names}</p>
        <p style="margin: 5px 0 0 0; font-size:0.85em; color:#666; display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #28a745;">person_add</span> Lugares libres: <strong>${availableSpots}</strong></p>
        <div class="card-actions">
           ${actionButton}
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) { container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar espacios libres.</p>'; }
}

async function claimShift(shiftId, dateStr, timeStr, capacity) {
  const [newStart, newEnd] = timeStr.split('-');
  for (let s of myCurrentShifts) {
    if (s.date === dateStr) {
      const [myStart, myEnd] = s.time.split('-');
      if (newStart < myEnd && myStart < newEnd) { showToast("Este horario se superpone con un turno que ya tienes.", "error"); return; }
    }
  }
  
  const isConfirmed = await showConfirm(`¿Deseas anotarte para este turno el ${formatSpanishDate(dateStr)}?`, "Tomar Turno", "#28a745");
  if(!isConfirmed) return;

  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];
    if (currentParticipants.length >= capacity) { showToast("Alguien más acaba de tomar este lugar.", "error"); loadAvailableShifts(); return; }
    
    currentParticipants.push(currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });
    showToast("¡Turno agregado con éxito!");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { showToast("Error al tomar turno: " + err.message, "error"); }
}

// ==========================================
// TAB 4: MI HORARIO
// ==========================================
async function loadAvailabilityForm() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('availability-form-container');
  try {
    const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
    const myAvail = pubDoc.data().availability || []; 
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const grouped = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };
    locSnapshot.forEach(doc => {
      const loc = doc.data();
      (loc.templates || []).forEach(t => {
        if (grouped[t.day] !== undefined) grouped[t.day].push({ name: loc.name, time: `${t.startTime} - ${t.endTime}`, val: `${loc.name}_${t.day}_${t.startTime}`, checked: myAvail.includes(`${loc.name}_${t.day}_${t.startTime}`) });
      });
    });
    container.innerHTML = '';
    let hasShifts = false;
    daysOrder.forEach(day => {
      if (grouped[day].length > 0) {
        hasShifts = true; grouped[day].sort((a, b) => a.time.localeCompare(b.time));
        const div = document.createElement('div'); div.className = 'day-group';
        let html = `<h4 class="day-title">${day}</h4>`;
        grouped[day].forEach(s => html += `<div class="shift-option"><input type="checkbox" id="chk-${s.val}" class="avail-checkbox" value="${s.val}" ${s.checked ? 'checked' : ''}><label for="chk-${s.val}"><strong>${s.name}</strong> (${s.time})</label></div>`);
        div.innerHTML = html; container.appendChild(div);
      }
    });
    if (!hasShifts) container.innerHTML = '<p style="text-align:center; color:#666;">No hay ubicaciones configuradas.</p>';
  } catch (error) {}
}

async function saveAvailability() {
  if (!currentUserPublisherId) return;
  const selected = Array.from(document.querySelectorAll('.avail-checkbox:checked')).map(cb => cb.value);
  try {
    await db.collection('publishers').doc(currentUserPublisherId).update({ availability: selected });
    showToast("¡Horario guardado con éxito!");
  } catch (error) { showToast("Error al guardar tu horario.", "error"); }
}

// ==========================================
// TAB 5: PERFIL & AUSENCIAS
// ==========================================
function handlePartnerChange() {
    const val = document.getElementById('prof-partner').value;
    document.getElementById('prof-hardpair-container').style.display = val ? 'flex' : 'none';
    if(!val) document.getElementById('prof-hardpair').checked = false;
    checkProfileChanges();
}

function renderMyAbsences() {
    const list = document.getElementById('my-absences-list');
    list.innerHTML = '';
    if(myAbsences.length === 0) {
        list.innerHTML = `<p style="font-size:0.9em; color:#999; margin:0;">No tienes ausencias programadas.</p>`;
        return;
    }
    myAbsences.forEach((abs, index) => {
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:12px; border-radius:6px; font-size:0.95em;">
            <span><strong style="color:#5d7aa9;">Ausente:</strong> ${formatSpanishDate(abs.start)} al ${formatSpanishDate(abs.end)}</span>
            <button type="button" onclick="removeMyAbsence(${index})" class="btn-action btn-danger" style="padding:6px 10px;"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
        </div>`;
    });
}

function addMyAbsence() {
    const s = document.getElementById('my-abs-start').value; const e = document.getElementById('my-abs-end').value;
    if(!s || !e) { showToast("Selecciona fecha de inicio y fin.", "error"); return; }
    if(s > e) { showToast("La fecha de fin no puede ser anterior al inicio.", "error"); return; }
    myAbsences.push({start: s, end: e});
    document.getElementById('my-abs-start').value = ''; document.getElementById('my-abs-end').value = '';
    renderMyAbsences();
    checkProfileChanges();
}

function removeMyAbsence(index) {
    myAbsences.splice(index, 1);
    renderMyAbsences();
    checkProfileChanges();
}

async function loadProfileForm() {
  if (!currentUserPublisherId || !currentPubData) return;
  try {
    const pub = currentPubData;
    
    // Check Notification Permission on load
    if (Notification.permission === 'granted' && pub.fcmToken) {
        document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#28a745;">Activadas</span>';
        document.getElementById('btn-enable-push').style.display = 'none';
    }

    document.getElementById('prof-phone').value = pub.phone || '';
    document.getElementById('prof-email').value = pub.notificationEmail || '';
    document.getElementById('prof-emerg-name').value = pub.emergencyName || '';
    document.getElementById('prof-emerg-phone').value = pub.emergencyPhone || '';
    document.getElementById('prof-max').value = pub.maxShifts || '5';
    document.getElementById('prof-hardpair').checked = pub.hardPair || false;

    const partnerSelect = document.getElementById('prof-partner');
    partnerSelect.innerHTML = '<option value="">Ninguno</option>';
    const sortedPubs = Object.keys(publisherCache).map(id => ({ id: id, name: publisherCache[id] })).sort((a, b) => a.name.localeCompare(b.name));
    sortedPubs.forEach(p => {
      if (p.id !== currentUserPublisherId) {
        const isSelected = p.id === pub.partner ? 'selected' : '';
        partnerSelect.innerHTML += `<option value="${p.id}" ${isSelected}>${p.name}</option>`;
      }
    });

    document.getElementById('prof-hardpair-container').style.display = pub.partner ? 'flex' : 'none';

    myAbsences = pub.absences || [];
    renderMyAbsences();

    originalProfileData = {
      phone: pub.phone || '', email: pub.notificationEmail || '', eName: pub.emergencyName || '',
      ePhone: pub.emergencyPhone || '', max: (pub.maxShifts || '5').toString(), partner: pub.partner || '', 
      hard: pub.hardPair || false, abs: JSON.stringify(myAbsences)
    };

    document.getElementById('btn-save-profile').disabled = true;

  } catch (error) { console.error("Error loading profile:", error); }
}

function checkProfileChanges() {
    const currentData = {
      phone: document.getElementById('prof-phone').value.trim(),
      email: document.getElementById('prof-email').value.trim(),
      eName: document.getElementById('prof-emerg-name').value.trim(),
      ePhone: document.getElementById('prof-emerg-phone').value.trim(),
      max: document.getElementById('prof-max').value,
      partner: document.getElementById('prof-partner').value,
      hard: document.getElementById('prof-hardpair').checked,
      abs: JSON.stringify(myAbsences)
    };
    
    const hasChanged = JSON.stringify(currentData) !== JSON.stringify(originalProfileData);
    document.getElementById('btn-save-profile').disabled = !hasChanged;
}

async function saveProfile() {
  if (!currentUserPublisherId) return;
  
  const emailVal = document.getElementById('prof-email').value.trim();
  if (emailVal) {
      if (!emailVal.includes('@') || !emailVal.includes('.')) { showToast("Por favor, ingresa un correo electrónico válido.", "error"); return; }
      if (emailVal.toLowerCase().endsWith('@jwpub.org')) { showToast("No se permiten correos @jwpub.org. Usa un correo personal.", "error"); return; }
  }

  const partnerId = document.getElementById('prof-partner').value;
  let partnerName = "";
  if (partnerId) { partnerName = publisherCache[partnerId]; }

  const profileData = {
    phone: document.getElementById('prof-phone').value.trim(),
    notificationEmail: emailVal,
    emergencyName: document.getElementById('prof-emerg-name').value.trim(),
    emergencyPhone: document.getElementById('prof-emerg-phone').value.trim(),
    maxShifts: parseInt(document.getElementById('prof-max').value),
    partner: partnerId,
    partnerName: partnerName,
    hardPair: document.getElementById('prof-hardpair').checked,
    absences: myAbsences
  };

  try {
    await db.collection('publishers').doc(currentUserPublisherId).update(profileData);
    
    originalProfileData = {
        phone: profileData.phone, email: profileData.notificationEmail, eName: profileData.emergencyName,
        ePhone: profileData.emergencyPhone, max: profileData.maxShifts.toString(), partner: profileData.partner, 
        hard: profileData.hardPair, abs: JSON.stringify(myAbsences)
    };
    
    currentPubData = { ...currentPubData, ...profileData };
    checkProfileChanges();
    showToast("¡Perfil y ausencias actualizados con éxito!");
  } catch (error) { showToast("Error al guardar perfil.", "error"); }
}
