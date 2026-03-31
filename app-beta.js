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
            pubSnap.forEach(d => {
                publisherCache[d.id] = {
                    name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(),
                    phone: d.data().phone || '',
                    isShiftManager: d.data().isShiftManager || false
                };
            });

            document.getElementById('header-user-name').innerText = `| ${publisherCache[currentUserPublisherId]?.name || ""}`;

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
      pubSnap.forEach(d => {
          publisherCache[d.id] = {
              name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(),
              phone: d.data().phone || '',
              isShiftManager: d.data().isShiftManager || false
          };
      });
      document.getElementById('header-user-name').innerText = `| ${publisherCache[currentUserPublisherId]?.name || ""}`;

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

// PWA & Messaging Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker registrado con éxito:', registration.scope);
            })
            .catch(err => {
                console.log('Falló el registro del Service Worker:', err);
            });
    });
}
async function enablePushNotifications() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {

            const registration = await navigator.serviceWorker.register('./service-worker.js');

            const token = await messaging.getToken({ 
                vapidKey: 'BCsvQHZK5ybZnRx28iqE5hLKOJeAmIuvNUA62-zJmLxRuJOHySmGeWIRIcN9qMx2-OjGmjlAm09montphPtiBgw',
                serviceWorkerRegistration: registration 
            });

            if (token) {
                await db.collection('publishers').doc(currentUserPublisherId).update({ fcmToken: token });
                showToast("¡Notificaciones activadas con éxito!");
                document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#28a745;">Activadas</span>';
                document.getElementById('btn-enable-push').style.display = 'none';
                document.getElementById('btn-disable-push').style.display = 'inline-flex'; 
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
} // <-- ESTA LLAVE FALTABA AQUÍ

async function disablePushNotifications() {
    try {
        // 1. Try to delete the token from Firebase's internal system
        try {
            await messaging.deleteToken();
        } catch (fcmError) {
            // Firebase throws a 404 on GitHub Pages subdirectories. We catch it here so the app doesn't crash.
            console.warn("FCM path error bypassed. Procediendo con limpieza local.", fcmError);
        }

        // 2. Force-delete the token from your Firestore database so the Admin stops sending alerts
        await db.collection('publishers').doc(currentUserPublisherId).update({ 
            fcmToken: firebase.firestore.FieldValue.delete() 
        });

        // We no longer unregister the Service Worker because it's shared with the main app cache.
        // By deleting the token above, Firebase knows not to send messages to this device anymore.
        
        showToast("Notificaciones desactivadas exitosamente.");
        document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#666;">Desactivadas</span>';
        document.getElementById('btn-enable-push').style.display = 'inline-flex';
        document.getElementById('btn-disable-push').style.display = 'none';
    } catch (error) {
        console.error("Error fatal al desactivar:", error);
        showToast("Hubo un problema al desactivar las notificaciones.", "error");
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
let dayManagersCache = {};

async function loadDayManagers() {
    try {
        const doc = await db.collection('settings').doc('dayManagers').get();
        if (doc.exists) dayManagersCache = doc.data();
    } catch(e) { console.error("Error loading day managers", e); }
}

function getShiftContactHtml(shift) {
    let contactHtml = '';

    // Check if local manager is required and present
    if (shift.requiresManager) {
        const localManagerId = (shift.participants || []).find(id => publisherCache[id]?.isShiftManager);
        if (localManagerId) {
            const mgr = publisherCache[localManagerId];
            if (mgr.phone) {
                const msg = encodeURIComponent(`Hola ${mgr.name}, te escribo sobre el turno en ${shift.location} de las ${shift.time}.`);
                contactHtml = `<a href="https://wa.me/${mgr.phone.replace(/\D/g,'')}?text=${msg}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid #5d7aa9; color:#5d7aa9; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600; text-decoration:none; margin-top:5px; transition:all 0.2s;"><svg style="width:14px; height:14px; fill:#5d7aa9;" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> Encargado: ${mgr.name}</a>`;
            } else {
                contactHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#f0f0f0; color:#555; padding:4px 10px; border-radius:12px; font-size:0.85em; margin-top:5px; font-weight:600;"><span class="material-symbols-outlined" style="font-size:14px;">local_police</span> Encargado: ${mgr.name}</span>`;
            }
            return contactHtml; // If local manager found, return it and stop.
        }
    }

    // If no local manager required or found, fallback to Day Manager
    const [y, m, d] = shift.date.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dateObj.getDay()];

    const dayManagerId = dayManagersCache[dayName];
    if (dayManagerId && publisherCache[dayManagerId]) {
        const mgr = publisherCache[dayManagerId];
        if (mgr.phone) {
            const msg = encodeURIComponent(`Hola ${mgr.name}, te escribo sobre el turno en ${shift.location} de las ${shift.time} (${shift.date}).`);
            contactHtml = `<a href="https://wa.me/${mgr.phone.replace(/\D/g,'')}?text=${msg}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid #5d7aa9; color:#5d7aa9; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600; text-decoration:none; margin-top:5px; transition:all 0.2s;"><svg style="width:14px; height:14px; fill:#5d7aa9;" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> Encargado: ${mgr.name}</a>`;
        } else {
            contactHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#f0f0f0; color:#555; padding:4px 10px; border-radius:12px; font-size:0.85em; margin-top:5px; font-weight:600;"><span class="material-symbols-outlined" style="font-size:14px;">support_agent</span> Encargado: ${mgr.name}</span>`;
        }
    }

    return contactHtml;
}

async function loadShifts() {
  await loadDayManagers();
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
    const participantNames = (shift.participants || []).map(id => publisherCache[id]?.name || 'Desconocido');
    const contactHtml = getShiftContactHtml(shift);
    const shiftCard = document.createElement('div');
    shiftCard.className = 'shift-card';
    shiftCard.innerHTML = `
      <div class="shift-card-header">
        <h4 class="shift-card-title"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px; color: #5d7aa9;">event</span>${formatSpanishDate(shift.date)}</h4>
        <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px; color: #666;">schedule</span>${shift.time}</span>
      </div>
      <p class="shift-card-detail" style="display:flex; justify-content:space-between; align-items:center;">
          <span><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545; vertical-align:-3px;">location_on</span> <strong>${shift.location}</strong></span>
          <button onclick="openLocationInfoModal('${shift.locationId}', '${shift.location}')" style="background:none; border:none; color:#5d7aa9; font-size:0.9em; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:1.1em;">info</span> Info</button>
      </p>
      <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> ${participantNames.join(', ')}</p>
      ${contactHtml}
    `;
    container.appendChild(shiftCard);
  });
}

function filterAllShifts() {
  const query = document.getElementById('search-all').value.toLowerCase();
  const filtered = allShiftsData.filter(s => {
      const names = (s.participants || []).map(id => publisherCache[id]?.name || '').join(' ').toLowerCase();
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
      const others = (shift.participants || []).filter(id => id !== currentUserPublisherId).map(id => publisherCache[id]?.name || 'Desconocido');
      const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';
      const contactHtml = getShiftContactHtml(shift);
      const shiftCard = document.createElement('div');
      shiftCard.className = 'shift-card mine';
      shiftCard.innerHTML = `
        <div class="shift-card-header">
          <h4 class="shift-card-title" style="color:#2c5282;"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">event</span>${formatSpanishDate(shift.date)}</h4>
          <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">schedule</span>${shift.time}</span>
        </div>
        <p class="shift-card-detail" style="display:flex; justify-content:space-between; align-items:center;">
          <span><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545; vertical-align:-3px;">location_on</span> <strong>${shift.location}</strong></span>
          <button onclick="openLocationInfoModal('${shift.locationId}', '${shift.location}')" style="background:none; border:none; color:#2c5282; font-size:0.9em; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:1.1em;">info</span> Info</button>
        </p>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> Con: ${partnerText}</p>
        ${contactHtml}
        <div class="card-actions" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 10px;">
           <button onclick="attemptCancel('${shift.id}', '${shift.date}', '${shift.time}', '${shift.location}')" class="btn-action btn-danger" style="width: 100%;">Cancelar Turno</button>
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
      const names = (shift.participants || []).map(id => publisherCache[id]?.name || 'Alguien').join(', ') || 'Vacío';
      const capacity = shift.capacity || 2;
      const availableSpots = capacity - (shift.participants || []).length;
      const contactHtml = getShiftContactHtml(shift);

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
        <p class="shift-card-detail" style="display:flex; justify-content:space-between; align-items:center;">
          <span><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545; vertical-align:-3px;">location_on</span> <strong>${shift.location}</strong></span>
          <button onclick="openLocationInfoModal('${shift.locationId}', '${shift.location}')" style="background:none; border:none; color:#28a745; font-size:0.9em; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:1.1em;">info</span> Info</button>
        </p>
        <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> Actuales: ${names}</p>
        <p style="margin: 5px 0 0 0; font-size:0.85em; color:#666; display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #28a745;">person_add</span> Lugares libres: <strong>${availableSpots}</strong></p>
        ${contactHtml}
        <div class="card-actions" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 10px;">
           ${actionButton}
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) { container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar espacios libres.</p>'; }
}

async function claimShift(shiftId, dateStr, timeStr, capacity) {
  const [newStart, newEnd] = timeStr.split('-');
  
  // 1. Check for local time overlaps first
  for (let s of myCurrentShifts) {
    if (s.date === dateStr) {
      const [myStart, myEnd] = s.time.split('-');
      if (newStart < myEnd && myStart < newEnd) { 
          showToast("Este horario se superpone con un turno que ya tienes.", "error"); 
          return; 
      }
    }
  }

  const isConfirmed = await showConfirm(`¿Deseas anotarte para este turno el ${formatSpanishDate(dateStr)}?`, "Tomar Turno", "#28a745");
  if(!isConfirmed) return;

  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    
    // 2. Run the secure transaction
    await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(shiftRef);
        
        if (!docSnap.exists) {
            throw new Error("El turno ya no existe.");
        }
        
        let currentParticipants = docSnap.data().participants || [];
        
        // Safety check inside the transaction
        if (currentParticipants.length >= capacity) {
            throw new Error("CAPACIDAD_LLENA"); 
        }
        if (currentParticipants.includes(currentUserPublisherId)) {
            throw new Error("Ya estás anotado en este turno.");
        }

        // Add user and commit update
        currentParticipants.push(currentUserPublisherId);
        transaction.update(shiftRef, { participants: currentParticipants });
    });

    // 3. Success handling
    showToast("¡Turno agregado con éxito!");
    loadMyShifts(); 
    loadAvailableShifts(); 
    loadShifts(); 

  } catch (err) { 
    // 4. Handle custom transaction errors smoothly
    if (err.message === "CAPACIDAD_LLENA") {
        showToast("Alguien más acaba de tomar este lugar.", "error"); 
        loadAvailableShifts(); // Refresh to show it's full
    } else {
        showToast("Error al tomar turno: " + err.message, "error"); 
    }
  }
}
// ==========================================
// FOREGROUND NOTIFICATION LISTENER
// ==========================================
// This catches notifications if the user happens to be looking at the app when it arrives
if (typeof messaging !== 'undefined') {
    messaging.onMessage((payload) => {
        console.log("Notificación recibida en primer plano:", payload);
        
        // Show the notification as a green Toast inside the app!
        showToast(`🔔 ${payload.notification.title} - ${payload.notification.body}`);
    });
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
      const locId = doc.id; // <-- WE GRAB THE IMMUTABLE ID HERE
      
      (loc.templates || []).forEach(t => {
        if (grouped[t.day] !== undefined) {
            // Build the key using locId, but keep loc.name for the UI label
            const availKey = `${locId}_${t.day}_${t.startTime}`;
            
            grouped[t.day].push({ 
                name: loc.name, 
                time: `${t.startTime} - ${t.endTime}`, 
                val: availKey, 
                checked: myAvail.includes(availKey) 
            });
        }
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
  } catch (error) { 
      console.error("Error al cargar disponibilidad:", error); 
  }
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
    // Check Notification Permission on load
    if (Notification.permission === 'granted' && pub.fcmToken) {
        document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#28a745;">Activadas</span>';
        document.getElementById('btn-enable-push').style.display = 'none';
        document.getElementById('btn-disable-push').style.display = 'inline-flex'; // <-- AÑADIDO ESTO
    } else {
        // Ensures correct UI if they disabled it on another device
        document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#555;">Sin activar</span>';
        document.getElementById('btn-enable-push').style.display = 'inline-flex';
        document.getElementById('btn-disable-push').style.display = 'none';
    }

    document.getElementById('prof-phone').value = pub.phone || '';
    document.getElementById('prof-email').value = pub.notificationEmail || '';
    document.getElementById('prof-email-notif-container').style.display = pub.notificationEmail ? 'flex' : 'none';
    document.getElementById('prof-email-notif').checked = pub.emailNotificationsEnabled || false;
    document.getElementById('prof-emerg-name').value = pub.emergencyName || '';
    document.getElementById('prof-emerg-phone').value = pub.emergencyPhone || '';
    document.getElementById('prof-max').value = pub.maxShifts || '5';
    document.getElementById('prof-hardpair').checked = pub.hardPair || false;

    const partnerSelect = document.getElementById('prof-partner');
    partnerSelect.innerHTML = '<option value="">Ninguno</option>';
    const sortedPubs = Object.keys(publisherCache).map(id => ({ id: id, name: publisherCache[id]?.name || '' })).sort((a, b) => a.name.localeCompare(b.name));
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
      phone: pub.phone || '', email: pub.notificationEmail || '', emailNotif: pub.emailNotificationsEnabled || false, eName: pub.emergencyName || '',
      ePhone: pub.emergencyPhone || '', max: (pub.maxShifts || '5').toString(), partner: pub.partner || '', 
      hard: pub.hardPair || false, abs: JSON.stringify(myAbsences)
    };

    document.getElementById('btn-save-profile').disabled = true;

  } catch (error) { console.error("Error loading profile:", error); }
}

function checkProfileChanges() {
    const emailVal = document.getElementById('prof-email').value.trim();
    document.getElementById('prof-email-notif-container').style.display = emailVal ? 'flex' : 'none';
    if (!emailVal) document.getElementById('prof-email-notif').checked = false;

    const currentData = {
      phone: document.getElementById('prof-phone').value.trim(),
      email: emailVal,
      emailNotif: document.getElementById('prof-email-notif').checked,
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
  if (partnerId) { partnerName = publisherCache[partnerId]?.name; }

  const profileData = {
    phone: document.getElementById('prof-phone').value.trim(),
    notificationEmail: emailVal,
    emailNotificationsEnabled: document.getElementById('prof-email-notif').checked,
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
        phone: profileData.phone, email: profileData.notificationEmail, emailNotif: profileData.emailNotificationsEnabled, eName: profileData.emergencyName,
        ePhone: profileData.emergencyPhone, max: profileData.maxShifts.toString(), partner: profileData.partner, 
        hard: profileData.hardPair, abs: JSON.stringify(myAbsences)
    };

    currentPubData = { ...currentPubData, ...profileData };
    checkProfileChanges();
    showToast("¡Perfil y ausencias actualizados con éxito!");
  } catch (error) { showToast("Error al guardar perfil.", "error"); }
}

// --- LOCATION INFO MODAL ---
async function openLocationInfoModal(locationId, locationName) {
    if(!locationId) { showToast("No se encontró información de la ubicación."); return; }

    document.getElementById('location-info-modal').style.display = 'flex';
    document.getElementById('info-modal-title').innerText = locationName || 'Información de Ubicación';
    document.getElementById('info-modal-map-btn-container').innerHTML = '<p style="color: #666;">Cargando...</p>';
    document.getElementById('info-modal-content').innerHTML = '';

    try {
        const doc = await db.collection('locations').doc(locationId).get();
        if(!doc.exists) {
            document.getElementById('info-modal-content').innerHTML = '<p>La información de esta ubicación no está disponible.</p>';
            document.getElementById('info-modal-map-btn-container').innerHTML = '';
            return;
        }

        const loc = doc.data();

        // Render Maps Button
        if(loc.mapsUrl) {
            document.getElementById('info-modal-map-btn-container').innerHTML = `
                <a href="${loc.mapsUrl}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 8px; background-color: #34a853; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1.05em; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <span class="material-symbols-outlined">map</span> Abrir en Google Maps
                </a>
            `;
        } else {
             document.getElementById('info-modal-map-btn-container').innerHTML = '';
        }

        // Render Info HTML
        if(loc.infoHtml && loc.infoHtml.trim() !== '') {
            document.getElementById('info-modal-content').innerHTML = loc.infoHtml;

            // Adjust any images in the quill HTML to be responsive
            const imgs = document.getElementById('info-modal-content').querySelectorAll('img');
            imgs.forEach(img => {
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '8px';
            });
        } else {
            document.getElementById('info-modal-content').innerHTML = '<p style="color: #666; font-style: italic;">No hay instrucciones adicionales para esta ubicación.</p>';
        }

    } catch(e) {
        console.error("Error loading location info:", e);
        document.getElementById('info-modal-content').innerHTML = '<p style="color: red;">Error al cargar la información.</p>';
        document.getElementById('info-modal-map-btn-container').innerHTML = '';
    }
}

function closeLocationInfoModal() {
    document.getElementById('location-info-modal').style.display = 'none';
}

window.openLocationInfoModal = openLocationInfoModal;
window.closeLocationInfoModal = closeLocationInfoModal;
