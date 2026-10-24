// app-beta.js - Complete File
// firebaseConfig is loaded from firebase-config.js

if (!Array.isArray(firebase.apps) || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
}
var auth = firebase.auth();
var db = firebase.firestore();
var messaging = typeof firebase.messaging === 'function' ? firebase.messaging() : undefined; // Initialize Messaging

let publisherCache = {};
let currentUserPublisherId = null;
let currentPubData = null;
let currentUserDocData = null;
let isCurrentUserAdmin = false;
let currentAppMode = 'publisher'; // 'publisher' | 'admin'
let adminDashboardInitialized = false;
let originalProfileData = {};
let myAbsences = [];

function openFullSchedule() {
    const newShiftBtn = document.getElementById('btn-admin-new-live-shift');
    if (newShiftBtn) {
        newShiftBtn.style.display = isCurrentUserAdmin ? 'inline-flex' : 'none';
    }
    document.getElementById('full-schedule-modal').style.display = 'flex';
    if (!allShiftsData || allShiftsData.length === 0) {
        loadShifts();
    }
}
function closeFullSchedule() { document.getElementById('full-schedule-modal').style.display = 'none'; }

function buildPublisherCacheEntry(pubId, rawPub) {
    const norm = normalizePublisherData(rawPub);
    return {
        id: pubId,
        name: `${norm.firstName || ''} ${norm.lastName || ''}`.trim(),
        firstName: norm.firstName || '',
        lastName: norm.lastName || '',
        phone: norm.phone || '',
        isShiftManager: norm.isShiftManager === true,
        isTrainer: norm.isTrainer === true,
        photoUrl: norm.photoUrl || '',
        isInactive: norm.isInactive === true || norm.status === 'Inactivo',
        status: norm.status || 'Aprobado',
        gender: norm.gender || '',
        availability: Array.isArray(norm.availability) ? norm.availability : [],
        absences: Array.isArray(norm.absences) ? norm.absences : [],
        partner: norm.partner || '',
        partnerName: norm.partnerName || '',
        hardPair: norm.hardPair === true,
        maxShifts: norm.maxShifts ? parseInt(norm.maxShifts, 10) || 5 : 5
    };
}

async function switchAppMode(targetMode) {
    if (targetMode === 'admin' && !isCurrentUserAdmin) {
        showToast("Acceso denegado: Se requieren permisos de administrador.", "error");
        return;
    }
    const appContent = document.getElementById('app-content');
    const adminDashboard = document.getElementById('dashboard-section');
    if (!appContent || !adminDashboard) return;

    currentAppMode = targetMode === 'admin' ? 'admin' : 'publisher';
    try {
        sessionStorage.setItem('ppam_active_view', currentAppMode);
    } catch (e) {}

    if (currentAppMode === 'admin') {
        appContent.style.display = 'none';
        adminDashboard.style.display = 'block';
        if (!adminDashboardInitialized && typeof initAdminDashboardForUnifiedApp === 'function') {
            adminDashboardInitialized = true;
            await initAdminDashboardForUnifiedApp(auth.currentUser, currentUserDocData, currentPubData);
        } else if (typeof loadPublishers === 'function') {
            await loadPublishers();
        }
    } else {
        adminDashboard.style.display = 'none';
        appContent.style.display = 'block';
        syncPublisherCacheFromAdmin();
        loadShifts();
        if (currentUserPublisherId) {
            loadMyShifts();
        }
        loadAvailableShifts();
    }
}

function syncPublisherCacheFromAdmin() {
    if (typeof allPublishers === 'undefined' || !allPublishers) return;
    // Clean any accidental numeric keys that may have been added previously
    Object.keys(publisherCache).forEach(k => {
        if (/^\d+$/.test(k)) delete publisherCache[k];
    });
    if (Array.isArray(allPublishers)) {
        const nextCache = {};
        allPublishers.forEach(rawPub => {
            if (!rawPub || !rawPub.id) return;
            nextCache[rawPub.id] = buildPublisherCacheEntry(rawPub.id, rawPub);
        });
        if (Object.keys(nextCache).length > 0) {
            publisherCache = nextCache;
        }
    } else if (typeof allPublishers === 'object') {
        Object.entries(allPublishers).forEach(([key, rawPub]) => {
            if (!rawPub) return;
            const realId = rawPub.id || key;
            if (/^\d+$/.test(realId)) return;
            publisherCache[realId] = buildPublisherCacheEntry(realId, rawPub);
        });
    }
}

function refreshPublisherLiveShiftsFromAdmin() {
    syncPublisherCacheFromAdmin();
    loadShifts();
    if (currentUserPublisherId) {
        loadMyShifts();
    }
    loadAvailableShifts();
}

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

function normalizePublisherData(rawPub) {
    if (!rawPub) return {};
    const pub = { ...rawPub };
    const rawAbs = Array.isArray(pub.absences) ? pub.absences : [];
    const realAbsences = [];
    const metaAbsences = [];
    const mergedReports = { ...(pub.shiftReports && typeof pub.shiftReports === 'object' ? pub.shiftReports : {}) };
    const mergedCancels = Array.isArray(pub.cancellationHistory) ? [...pub.cancellationHistory] : [];
    let fallbackPhotoUrl = '';
    let fallbackIsInactive = undefined;

    rawAbs.forEach(item => {
        if (item && typeof item === 'object' && item._metaType) {
            metaAbsences.push(item);
            if (item._metaType === 'photo' && typeof item.photoUrl === 'string') {
                fallbackPhotoUrl = item.photoUrl;
            } else if (item._metaType === 'inactive' && typeof item.isInactive === 'boolean') {
                fallbackIsInactive = item.isInactive;
            } else if (item._metaType === 'report' && item.shiftId && item.report) {
                const existing = mergedReports[item.shiftId];
                if (!existing || (item.report.updatedAt || '') >= (existing.updatedAt || '')) {
                    mergedReports[item.shiftId] = item.report;
                }
            } else if (item._metaType === 'cancel' && item.cancelEntry) {
                const ce = item.cancelEntry;
                const dup = mergedCancels.some(c => c.shiftId === ce.shiftId && c.cancelledAt === ce.cancelledAt);
                if (!dup) mergedCancels.push(ce);
            }
        } else if (item && item.start && item.end) {
            realAbsences.push(item);
        }
    });

    if (!pub.photoUrl && fallbackPhotoUrl) {
        pub.photoUrl = fallbackPhotoUrl;
    }
    if (typeof fallbackIsInactive === 'boolean') {
        pub.isInactive = fallbackIsInactive;
    } else if (typeof pub.isInactive === 'boolean') {
        pub.isInactive = pub.isInactive;
    } else if (pub.status === 'Inactivo') {
        pub.isInactive = true;
    } else {
        pub.isInactive = false;
    }
    pub.shiftReports = mergedReports;
    pub.cancellationHistory = mergedCancels;
    pub.absences = realAbsences;
    pub._metaAbsences = metaAbsences;
    return pub;
}

async function updatePublisherMetaViaAbsencesFallback(pubId, mutateMetaFn, extraWhitelistedFields = {}) {
    const pubRef = db.collection('publishers').doc(pubId);
    const snap = await pubRef.get();
    const rawData = snap.exists ? snap.data() : (currentPubData || {});
    const rawAbs = Array.isArray(rawData.absences) ? rawData.absences : [];
    const realAbs = rawAbs.filter(item => item && !item._metaType && item.start && item.end);
    let metaAbs = rawAbs.filter(item => item && item._metaType);
    metaAbs = mutateMetaFn(metaAbs) || metaAbs;
    const updatedAbsences = [...realAbs, ...metaAbs];
    const payload = {
        absences: updatedAbsences,
        lastProfileChange: new Date().toISOString(),
        ...extraWhitelistedFields
    };
    await pubRef.update(payload);
    if (currentPubData && pubId === currentUserPublisherId) {
        currentPubData._metaAbsences = metaAbs;
    }
}

auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-overlay').style.display = 'none';
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      currentUserDocData = userData;

      const isMasterEmailAdmin = user.email && !user.email.endsWith('@ppam.app');
      isCurrentUserAdmin = (userData && userData.role === 'admin') || isMasterEmailAdmin;
      adminDashboardInitialized = false;

      if (userDoc.exists || isCurrentUserAdmin) {
        currentUserPublisherId = userData.publisherId || null;

        if (currentUserPublisherId) {
            const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
            if (pubDoc.exists) {
                currentPubData = normalizePublisherData(pubDoc.data());
                const now = new Date();
                const lastLogin = currentPubData.lastLogin ? new Date(currentPubData.lastLogin) : new Date(0);
                if (now - lastLogin > 1000 * 60 * 5) { // Update lastLogin at most every 5 minutes
                    db.collection('publishers').doc(currentUserPublisherId).update({ lastLogin: now.toISOString() }).catch(e => console.error(e));
                }
            } else if (!isCurrentUserAdmin) {
                console.warn("Cuenta desvinculada.");
                auth.signOut();
                showToast("Tu cuenta fue desvinculada por el administrador. Por favor, vuelve a iniciar sesión.", "error");
                return;
            }
        } else if (!isCurrentUserAdmin) {
            console.warn("Cuenta sin perfil de publicador.");
            auth.signOut();
            showToast("Tu cuenta fue desvinculada por el administrador.", "error");
            return;
        }

        if (userData.requirePasswordChange) {
            db.collection('users').doc(user.uid).update({ requirePasswordChange: false }).catch(e => console.warn(e));
        }

        document.getElementById('force-password-modal').style.display = 'none';

        const adminSwitchBtn = document.getElementById('btn-switch-to-admin');
        if (adminSwitchBtn) {
            adminSwitchBtn.style.display = isCurrentUserAdmin ? 'inline-flex' : 'none';
        }

        const pubSnap = await db.collection('publishers').get();
        publisherCache = {};
        pubSnap.forEach(d => {
            publisherCache[d.id] = buildPublisherCacheEntry(d.id, d.data());
        });

        const displayName = (currentUserPublisherId && publisherCache[currentUserPublisherId]?.name)
            ? publisherCache[currentUserPublisherId].name
            : (isCurrentUserAdmin ? 'Administrador' : '');
        document.getElementById('header-user-name').innerText = displayName ? `| ${displayName}` : '';

        fetchEncarnacionWeather();
        loadShifts();
        if (currentUserPublisherId) {
            loadMyShifts();
            loadAvailabilityForm();
            loadProfileForm();
        }
        loadAvailableShifts();

        const urlParams = new URLSearchParams(window.location.search);
        let savedView = null;
        try { savedView = sessionStorage.getItem('ppam_active_view'); } catch (e) {}
        const wantAdminView = isCurrentUserAdmin && (
            urlParams.get('view') === 'admin' ||
            savedView === 'admin' ||
            !currentUserPublisherId
        );

        if (wantAdminView) {
            await switchAppMode('admin');
        } else {
            document.getElementById('dashboard-section').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            currentAppMode = 'publisher';
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
    const adminDashboard = document.getElementById('dashboard-section');
    if (adminDashboard) adminDashboard.style.display = 'none';
    const adminSwitchBtn = document.getElementById('btn-switch-to-admin');
    if (adminSwitchBtn) adminSwitchBtn.style.display = 'none';
    document.getElementById('force-password-modal').style.display = 'none';
    currentUserPublisherId = null;
    currentPubData = null;
    currentUserDocData = null;
    isCurrentUserAdmin = false;
    adminDashboardInitialized = false;
    currentAppMode = 'publisher';
  }
});

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  const icon = btnEl ? btnEl.querySelector('.material-symbols-outlined') : null;
  if (icon) icon.innerText = isPass ? 'visibility_off' : 'visibility';
}

function handleGatekeeperLogin() {
  const usernameInput = document.getElementById('gate-username').value.trim();
  const pass = document.getElementById('gate-password').value;
  const errorDiv = document.getElementById('gate-error');
  errorDiv.innerText = "";
  const cleanInput = usernameInput.toLowerCase().replace(/\s+/g, '');
  const email = cleanInput.includes('@') ? cleanInput : cleanInput + '@ppam.app';
  auth.signInWithEmailAndPassword(email, pass).catch(err => {
    console.error("Firebase Login Error:", err);
    errorDiv.innerText = `Error: Verifica tu usuario o contraseña. (${err.code || err.message})`;
  });
}

function logout() {
  try { sessionStorage.removeItem('ppam_active_view'); } catch (e) {}
  auth.signOut();
}

function switchTab(tabId) {
  const pubContainer = document.getElementById('app-content');
  const scope = pubContainer || document;
  scope.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  scope.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.getElementById('tab-btn-' + tabId);
  const tab = document.getElementById('tab-' + tabId);
  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');
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
      publisherCache = {};
      pubSnap.forEach(d => {
          publisherCache[d.id] = buildPublisherCacheEntry(d.id, d.data());
      });
      document.getElementById('header-user-name').innerText = `| ${publisherCache[currentUserPublisherId]?.name || ""}`;

      showToast("¡Contraseña creada exitosamente!");
      fetchEncarnacionWeather();
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
        if (typeof Notification === 'undefined') {
            showToast("Tu dispositivo o navegador no soporta notificaciones web.", "error");
            return;
        }

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

    // ALWAYS check if an "encargado de turno" is assigned to the shift,
    // regardless of whether the location strictly requires one.
    // Make sure we explicitly check for true to avoid undefined/string issues.
    const localManagerId = (shift.participants || []).find(id => publisherCache[id] && publisherCache[id].isShiftManager === true);

    if (localManagerId) {
        const mgr = publisherCache[localManagerId];
        if (mgr.phone) {
            const msg = encodeURIComponent(`Hola ${mgr.name}, te escribo sobre el turno en ${shift.location} de las ${shift.time}.`);
            let cleanPhone = mgr.phone.replace(/\D/g, ''); // Extract digits
            // Graceful fallback for legacy numbers missing the country code (assuming Paraguay +595)
            if (cleanPhone.startsWith('09')) cleanPhone = '595' + cleanPhone.substring(1);
            else if (cleanPhone.startsWith('9')) cleanPhone = '595' + cleanPhone;

            contactHtml = `<a href="https://wa.me/${cleanPhone}?text=${msg}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid #5d7aa9; color:#5d7aa9; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600; text-decoration:none; margin-top:5px; transition:all 0.2s;"><svg style="width:14px; height:14px; fill:#5d7aa9;" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> Encargado: ${mgr.name}</a>`;
        } else {
            contactHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#f0f0f0; color:#555; padding:4px 10px; border-radius:12px; font-size:0.85em; margin-top:5px; font-weight:600;"><span class="material-symbols-outlined" style="font-size:14px;">local_police</span> Encargado: ${mgr.name}</span>`;
        }
        return contactHtml; // If ANY local manager is found, return it and stop.
    }

    // If NO local manager is found, but the location REQUIRES one, hide the day manager
    if (shift.requiresManager) {
        return '';
    }

    // If no local manager is found AND the location does NOT require one, fallback to Day Manager
    const [y, m, d] = shift.date.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dateObj.getDay()];

    const dayManagerId = dayManagersCache[dayName];
    if (dayManagerId && publisherCache[dayManagerId]) {
        const mgr = publisherCache[dayManagerId];
        if (mgr.phone) {
            const msg = encodeURIComponent(`Hola ${mgr.name}, te escribo sobre el turno en ${shift.location} de las ${shift.time} (${shift.date}).`);
            let cleanPhone = mgr.phone.replace(/\D/g, '');
            if (cleanPhone.startsWith('09')) cleanPhone = '595' + cleanPhone.substring(1);
            else if (cleanPhone.startsWith('9')) cleanPhone = '595' + cleanPhone;

            contactHtml = `<a href="https://wa.me/${cleanPhone}?text=${msg}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid #28a745; color:#28a745; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600; text-decoration:none; margin-top:5px; transition:all 0.2s;"><svg style="width:14px; height:14px; fill:#28a745;" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> Encargado: ${mgr.name}</a>`;
        } else {
            contactHtml = `<span style="display:inline-flex; align-items:center; gap:5px; background:#f0f0f0; color:#555; padding:4px 10px; border-radius:12px; font-size:0.85em; margin-top:5px; font-weight:600;"><span class="material-symbols-outlined" style="font-size:14px;">support_agent</span> Encargado: ${mgr.name}</span>`;
        }
    }

    return contactHtml;
}

let showPastShifts = false;

function togglePastShifts() {
    showPastShifts = !showPastShifts;
    const btn = document.getElementById('btn-toggle-past');
    if (btn) {
        btn.innerHTML = showPastShifts
            ? '<span class="material-symbols-outlined" style="font-size:18px; vertical-align:-3px;">visibility_off</span> Ocultar turnos pasados'
            : '<span class="material-symbols-outlined" style="font-size:18px; vertical-align:-3px;">history</span> Mostrar turnos pasados';
    }
    filterAllShifts();
}

async function loadShifts() {
  await loadDayManagers();
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center; color:#666;">Cargando programa...</p>';
  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    container.innerHTML = ''; allShiftsData = [];
    shiftsSnapshot.forEach(doc => { let shift = doc.data(); shift.id = doc.id; allShiftsData.push(shift); });
    filterAllShifts();
  } catch (error) { container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar el programa.</p>'; }
}

function renderAllShifts(shifts) {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '';
  if(shifts.length === 0) { container.innerHTML = '<p style="text-align:center; color:#666;">No hay turnos programados.</p>'; return; }
  shifts.forEach(shift => {
    const realParticipants = (shift.participants || []).filter(id => id && id !== 'Disponible');
    const participantNames = realParticipants.map(id => publisherCache[id]?.name || 'Desconocido');
    const capacity = shift.capacity || 2;
    const freeCount = Math.max(0, capacity - realParticipants.length);
    const participantsDisplay = participantNames.length > 0
      ? participantNames.join(', ') + (freeCount > 0 ? ` <span style="color:#28a745; font-weight:600; font-size:0.88em;">(${freeCount} libre${freeCount > 1 ? 's' : ''})</span>` : '')
      : `<span style="color:#888; font-style:italic;">Vacío (${capacity} lugares libres)</span>`;
    const contactHtml = getShiftContactHtml(shift);
    const adminEditHtml = isCurrentUserAdmin ? `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: flex-end;">
        <button type="button" onclick="openQuickLiveShiftEditModal('${shift.id}')" style="background: #eef4ff; color: #2c5282; border: 1px solid #cdddf7; padding: 5px 11px; border-radius: 6px; font-size: 0.84em; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
          <span class="material-symbols-outlined" style="font-size: 16px;">manage_accounts</span> Editar Participantes
        </button>
      </div>
    ` : '';
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
      <p class="shift-card-detail"><span class="material-symbols-outlined" style="font-size: 1.2em; color: #6c757d;">group</span> <span>${participantsDisplay}</span></p>
      ${contactHtml}
      ${adminEditHtml}
    `;
    container.appendChild(shiftCard);
  });
}

function filterAllShifts() {
  const query = document.getElementById('search-all').value.toLowerCase();
  const todayStr = getTodayString();

  const filtered = allShiftsData.filter(s => {
      if (!showPastShifts && s.date < todayStr) return false;

      const names = (s.participants || []).map(id => publisherCache[id]?.name || '').join(' ').toLowerCase();
      const spanishDate = formatSpanishDate(s.date).toLowerCase();
      return s.location.toLowerCase().includes(query) || s.date.includes(query) || spanishDate.includes(query) || names.includes(query);
  });
  renderAllShifts(filtered);
}

let myCurrentShifts = [];
let myAllAssignedShifts = [];
let demoReportShift = null;
let myHistoryExpanded = false;
let encarnacionWeatherCache = null;
let encarnacionWeatherLoading = null;

// ==========================================
// AVATAR, WHATSAPP PARTNER, WEATHER & CALENDAR HELPERS
// ==========================================
function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(str) {
  const colors = ['#5d7aa9', '#2b6cb0', '#2f855a', '#b7791f', '#805ad5', '#c53030', '#0987a0'];
  let hash = 0;
  const s = str || 'ppam';
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatWhatsAppPhone(rawPhone) {
  if (!rawPhone) return '';
  let cleanPhone = rawPhone.replace(/\D/g, '');
  if (!cleanPhone) return '';
  if (cleanPhone.startsWith('09')) cleanPhone = '595' + cleanPhone.substring(1);
  else if (cleanPhone.startsWith('9') && cleanPhone.length === 9) cleanPhone = '595' + cleanPhone;
  return cleanPhone;
}

function getAvatarHtml(pubId, sizePx = 36) {
  const pub = publisherCache[pubId] || {};
  const name = pub.name || 'Publicador';
  const photoUrl = pub.photoUrl || '';
  const initials = getInitials(name);
  const bg = getAvatarColor(pubId || name);

  if (photoUrl) {
    return `<button type="button" onclick="openPhotoPreviewModal('${pubId}')" title="Ver foto de ${name.replace(/"/g, '&quot;')}" style="width:${sizePx}px; height:${sizePx}px; border-radius:50%; padding:0; border:2px solid #dce4ee; overflow:hidden; cursor:pointer; background:#eee; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 4px rgba(0,0,0,0.1);">
      <img src="${photoUrl}" alt="${initials}" style="width:100%; height:100%; object-fit:cover; display:block;">
    </button>`;
  }

  return `<span style="width:${sizePx}px; height:${sizePx}px; border-radius:50%; background:${bg}; color:white; font-weight:700; font-size:${Math.round(sizePx * 0.4)}px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.1);">${initials}</span>`;
}

function openPhotoPreviewModal(pubId) {
  const pub = publisherCache[pubId];
  const photoUrl = (pub && pub.photoUrl) || (pubId === currentUserPublisherId && currentPubData?.photoUrl) || '';
  if (!photoUrl) return;
  const displayName = (pub && pub.name) || `${currentPubData?.firstName || ''} ${currentPubData?.lastName || ''}`.trim() || 'Foto de Perfil';
  document.getElementById('photo-preview-title').innerText = displayName;
  document.getElementById('photo-preview-img').src = photoUrl;
  document.getElementById('photo-preview-modal').style.display = 'flex';
}

function closePhotoPreviewModal() {
  const modal = document.getElementById('photo-preview-modal');
  if (modal) modal.style.display = 'none';
}

function getPartnerRowsHtmlForMisTurnos(shift) {
  const partnerIds = (shift.participants || []).filter(id => id && id !== "Disponible" && id !== currentUserPublisherId);
  if (partnerIds.length === 0) {
    return `<div style="display:flex; align-items:center; gap:8px; margin:8px 0; color:#666; font-size:0.95em;">
      <span class="material-symbols-outlined" style="font-size:1.2em; color:#6c757d;">person</span>
      <span>Compañero(a): <strong>Solo/a</strong></span>
    </div>`;
  }

  const rows = partnerIds.map(pid => {
    const p = publisherCache[pid] || { name: 'Desconocido', phone: '', photoUrl: '' };
    const avatarHtml = getAvatarHtml(pid, 36);
    const cleanPhone = formatWhatsAppPhone(p.phone);
    let waBtnHtml = '';
    if (cleanPhone) {
      const msg = encodeURIComponent(`¡Hola ${p.name}! Te escribo por nuestro turno de PPAM en ${shift.location} el ${formatSpanishDate(shift.date)} (${shift.time}).`);
      waBtnHtml = `
        <a href="https://wa.me/${cleanPhone}?text=${msg}" target="_blank" rel="noopener" title="Enviar WhatsApp a ${p.name.replace(/"/g, '&quot;')}" style="display:inline-flex; align-items:center; gap:5px; background:#e8f8ee; border:1px solid #25D366; color:#128C7E; padding:5px 10px; border-radius:16px; font-size:0.82em; font-weight:700; text-decoration:none; margin-left:auto; flex-shrink:0; transition:all 0.2s;">
          <svg style="width:14px; height:14px; fill:#25D366;" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
          WhatsApp
        </a>
      `;
    }
    return `
      <div style="display:flex; align-items:center; gap:10px; background:#f8fafd; border:1px solid #e6edf5; padding:7px 10px; border-radius:10px;">
        ${avatarHtml}
        <div style="display:flex; flex-direction:column; min-width:0;">
          <span style="font-size:0.75em; color:#6c757d; text-transform:uppercase; letter-spacing:0.3px; font-weight:600;">Compañero(a)</span>
          <strong style="color:#2d3748; font-size:0.95em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</strong>
        </div>
        ${waBtnHtml}
      </div>
    `;
  }).join('');

  return `<div style="display:flex; flex-direction:column; gap:6px; margin:8px 0;">${rows}</div>`;
}

// ==========================================
// ENCARNACIÓN WEATHER FORECAST (OPEN-METEO)
// ==========================================
async function fetchEncarnacionWeather() {
  if (encarnacionWeatherCache) return encarnacionWeatherCache;
  if (encarnacionWeatherLoading) return encarnacionWeatherLoading;

  encarnacionWeatherLoading = (async () => {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=-27.3306&longitude=-55.8667&hourly=temperature_2m,precipitation_probability,weathercode&timezone=America%2FAsuncion&forecast_days=7';
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.hourly && Array.isArray(data.hourly.time)) {
        const byTime = {};
        data.hourly.time.forEach((isoTime, idx) => {
          byTime[isoTime] = {
            temp: Math.round(data.hourly.temperature_2m[idx]),
            pop: data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 0,
            code: data.hourly.weathercode ? data.hourly.weathercode[idx] : 0
          };
        });
        encarnacionWeatherCache = byTime;
        // Refresh Mis Turnos weather badges if already rendered
        document.querySelectorAll('[data-weather-shift-id]').forEach(el => {
          const sId = el.getAttribute('data-weather-shift-id');
          const shift = myCurrentShifts.find(s => s.id === sId);
          if (shift) {
            el.innerHTML = getShiftWeatherBadgeHtml(shift);
          }
        });
        return encarnacionWeatherCache;
      }
    } catch (e) {
      console.warn('Weather forecast unavailable:', e);
    }
    return null;
  })();

  return encarnacionWeatherLoading;
}

function getShiftWeatherBadgeHtml(shift) {
  if (!encarnacionWeatherCache || !shift || !shift.date || !shift.time) return '';
  const startRaw = (shift.time.split('-')[0] || '08:00').trim();
  const hourStr = startRaw.split(':')[0].padStart(2, '0');
  const lookupKey = `${shift.date}T${hourStr}:00`;
  const w = encarnacionWeatherCache[lookupKey];
  if (!w) return '';

  let emoji = '☀️';
  let label = 'Despejado';
  if (w.code >= 95) { emoji = '⛈️'; label = 'Tormenta'; }
  else if (w.code >= 61 || w.pop >= 60) { emoji = '🌧️'; label = 'Lluvia'; }
  else if (w.code >= 51 || w.pop >= 35) { emoji = '🌦️'; label = 'Prob. lluvia'; }
  else if (w.code >= 1 && w.code <= 3) { emoji = '⛅'; label = 'Parcial nublado'; }
  else if (w.code >= 45 && w.code <= 48) { emoji = '🌫️'; label = 'Neblina'; }

  const isRainy = w.pop >= 40 || w.code >= 51;
  const bg = isRainy ? '#fff8e6' : '#eef6ff';
  const border = isRainy ? '#ffd88a' : '#cde2f7';
  const color = isRainy ? '#92400e' : '#1e4e8c';

  return `<span title="Pronóstico en Encarnación (${label}) a las ${hourStr}:00" style="display:inline-flex; align-items:center; gap:5px; background:${bg}; border:1px solid ${border}; color:${color}; padding:3px 9px; border-radius:12px; font-size:0.78em; font-weight:600;">
    <span>${emoji} ${w.temp}°C</span>
    <span style="opacity:0.85;">• 💧${w.pop}%</span>
  </span>`;
}

// ==========================================
// CALENDAR EXPORT (GOOGLE CALENDAR & .ICS)
// ==========================================
function parseShiftStartEndDates(shift) {
  const parts = (shift.time || '08:00-10:00').split('-');
  const startStr = (parts[0] || '08:00').trim();
  const endStr = (parts[1] || '10:00').trim();
  const [y, m, d] = (shift.date || getTodayString()).split('-').map(Number);
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, sh || 8, sm || 0, 0);
  const end = new Date(y, (m || 1) - 1, d || 1, eh || (sh + 2), em || 0, 0);
  return { start, end, startStr, endStr };
}

function toCalUtcStamp(dateObj) {
  return dateObj.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function toCalLocalStamp(dateStr, timeStr) {
  const cleanDate = (dateStr || '').replace(/-/g, '');
  const [hh, mm] = (timeStr || '08:00').trim().split(':');
  return `${cleanDate}T${String(hh || '08').padStart(2, '0')}${String(mm || '00').padStart(2, '0')}00`;
}

function openCalendarModal(shiftId) {
  const shift = myCurrentShifts.find(s => s.id === shiftId) || myAllAssignedShifts.find(s => s.id === shiftId);
  if (!shift) {
    showToast("No se encontró el turno.", "error");
    return;
  }

  const others = (shift.participants || [])
    .filter(id => id && id !== "Disponible" && id !== currentUserPublisherId)
    .map(id => publisherCache[id]?.name || 'Desconocido');
  const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';

  const { startStr, endStr } = parseShiftStartEndDates(shift);
  const dtStartLocal = toCalLocalStamp(shift.date, startStr);
  const dtEndLocal = toCalLocalStamp(shift.date, endStr);

  const title = `Turno PPAM - ${shift.location}`;
  const description = `Turno de Predicación Pública (PPAM Encarnación)\nUbicación: ${shift.location}\nHorario: ${shift.time}\nCompañero(a): ${partnerText}`;
  const locationText = `${shift.location}, Encarnación, Paraguay`;

  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStartLocal}/${dtEndLocal}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(locationText)}&ctz=America/Asuncion`;

  document.getElementById('calendar-shift-summary').innerHTML = `
    <div><strong>📍 Ubicación:</strong> ${shift.location}</div>
    <div><strong>📅 Fecha:</strong> ${formatSpanishDate(shift.date)} (${shift.time})</div>
    <div><strong>👥 Compañero(a):</strong> ${partnerText}</div>
  `;

  const gcalBtn = document.getElementById('btn-cal-google');
  gcalBtn.href = gcalUrl;

  const icsBtn = document.getElementById('btn-cal-ics');
  icsBtn.onclick = () => {
    downloadShiftIcs(shift, title, description, locationText, dtStartLocal, dtEndLocal);
    closeCalendarModal();
  };

  document.getElementById('calendar-export-modal').style.display = 'flex';
}

function closeCalendarModal() {
  const modal = document.getElementById('calendar-export-modal');
  if (modal) modal.style.display = 'none';
}

function downloadShiftIcs(shift, title, description, locationText, dtStartLocal, dtEndLocal) {
  const nowUtc = toCalUtcStamp(new Date());
  const escapedDesc = (description || '').replace(/\n/g, '\\n');
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PPAM Encarnacion//Turnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:ppam-shift-${shift.id}@ppam-encarnacion`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${dtStartLocal}`,
    `DTEND:${dtEndLocal}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${escapedDesc}`,
    `LOCATION:${locationText}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio: Turno PPAM en 1 hora',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `turno-ppam-${shift.date}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
  showToast("Archivo de calendario (.ics) descargado.");
}

function toggleMyShiftHistory() {
  myHistoryExpanded = !myHistoryExpanded;
  const body = document.getElementById('my-history-collapsible-body');
  const icon = document.getElementById('my-history-chevron');
  if (body) body.style.display = myHistoryExpanded ? 'flex' : 'none';
  if (icon) icon.innerText = myHistoryExpanded ? 'expand_less' : 'expand_more';
}

function isTestPreviewEnv() {
  const h = window.location.hostname || '';
  return h.includes('run.app') || h === 'localhost' || h === '127.0.0.1';
}

function toggleDemoReportShift() {
  if (demoReportShift) {
    demoReportShift = null;
  } else {
    demoReportShift = {
      id: '__demo_report_shift__',
      date: getTodayString(),
      time: '08:00 - 10:00',
      location: 'Costanera (Turno de Prueba)',
      participants: [currentUserPublisherId],
      reports: {}
    };
  }
  loadMyShifts();
  if (demoReportShift) {
    openShiftReportModal('__demo_report_shift__');
  }
}

function getDaysAgoString(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isShiftFinished(shift) {
  if (!shift || !shift.date) return false;
  const parts = (shift.time || '').split('-');
  const endTime = (parts[1] || parts[0] || '23:59').trim();
  const shiftEndDate = new Date(`${shift.date}T${endTime}:00`);
  if (isNaN(shiftEndDate.getTime())) {
    return shift.date < getTodayString();
  }
  return shiftEndDate <= new Date();
}

function getMyReportForShift(shift) {
  if (!shift) return null;
  if (shift.id === '__demo_report_shift__' && shift.reports && shift.reports[currentUserPublisherId]) {
    return shift.reports[currentUserPublisherId];
  }
  if (currentPubData && currentPubData.shiftReports && currentPubData.shiftReports[shift.id]) {
    return currentPubData.shiftReports[shift.id];
  }
  if (shift.reports && shift.reports[currentUserPublisherId]) {
    return shift.reports[currentUserPublisherId];
  }
  return null;
}

async function loadMyShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('mine-container');
  container.innerHTML = '<p style="text-align:center; color:#666;">Buscando tus turnos...</p>';
  try {
    fetchEncarnacionWeather();
    const todayStr = getTodayString();
    const cutoffStr = getDaysAgoString(14);
    const shiftsSnapshot = await db.collection('shifts').where('participants', 'array-contains', currentUserPublisherId).get();
    myCurrentShifts = [];
    myAllAssignedShifts = [];
    const recentFinishedShifts = [];
    const allFinishedShifts = [];

    shiftsSnapshot.forEach(doc => {
        let s = doc.data(); s.id = doc.id;
        myAllAssignedShifts.push(s);
        if (isShiftFinished(s)) {
            allFinishedShifts.push(s);
            if (s.date >= cutoffStr) {
                recentFinishedShifts.push(s);
            }
        } else if (s.date >= todayStr) {
            myCurrentShifts.push(s);
        }
    });

    if (demoReportShift) {
      myAllAssignedShifts.unshift(demoReportShift);
      recentFinishedShifts.unshift(demoReportShift);
      allFinishedShifts.unshift(demoReportShift);
    }

    container.innerHTML = '';

    // In AI Studio preview only: show a safe sandbox button to preview the Informe de Turno
    if (isTestPreviewEnv()) {
      const previewBar = document.createElement('div');
      previewBar.style.cssText = 'background: #eef4ff; border: 1px dashed #5d7aa9; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.88em; color: #2c5282;';
      previewBar.innerHTML = `
        <span><strong>🛠️ Modo Vista Previa (Solo en AI Studio):</strong> Prueba cómo se ve y funciona el <em>Informe de Turno</em> sin tocar la base de datos en vivo.</span>
        <button type="button" onclick="toggleDemoReportShift()" class="btn-action" style="background: ${demoReportShift ? '#6c757d' : '#5d7aa9'}; color: white; padding: 6px 12px; font-size: 0.9em;">
          <span class="material-symbols-outlined" style="font-size: 16px;">${demoReportShift ? 'visibility_off' : 'visibility'}</span>
          ${demoReportShift ? 'Ocultar Turno de Prueba' : 'Ver / Probar Informe de Turno'}
        </button>
      `;
      container.appendChild(previewBar);
    }

    myCurrentShifts.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    recentFinishedShifts.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
    allFinishedShifts.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));

    // If the user's account is currently marked as Inactive, show a helpful banner with a 1-click Reactivate button
    if (currentPubData && currentPubData.isInactive) {
      const inactiveBanner = document.createElement('div');
      inactiveBanner.style.cssText = 'background: #f8fafd; border: 1px solid #cbd5e0; border-left: 5px solid #6c757d; padding: 15px 18px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;';
      inactiveBanner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 220px;">
          <span class="material-symbols-outlined" style="color: #6c757d; font-size: 26px; margin-top: 2px;">pause_circle</span>
          <div>
            <strong style="color: #2d3748; display: block; margin-bottom: 3px;">Tu cuenta está en modo Inactivo (Pausa de asignaciones)</strong>
            <span style="font-size: 0.9em; color: #4a5568;">No recibirás nuevas asignaciones automáticas mientras tu cuenta esté en pausa. Tus preferencias de horario siguen guardadas.</span>
          </div>
        </div>
        <button type="button" onclick="toggleMyAccountActiveStatus()" class="btn-action btn-success" style="white-space: nowrap;">
          <span class="material-symbols-outlined" style="font-size: 18px;">play_circle</span> Reactivar mi cuenta
        </button>
      `;
      container.appendChild(inactiveBanner);
    }

    // Check if there are finished shifts without a submitted report from this publisher
    const pendingReportShifts = recentFinishedShifts.filter(s => !getMyReportForShift(s));
    if (pendingReportShifts.length > 0) {
      const firstPending = pendingReportShifts[0];
      const bannerDiv = document.createElement('div');
      bannerDiv.style.cssText = 'background: #fff8e6; border: 1px solid #ffd88a; border-left: 5px solid #f59f00; padding: 15px 18px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;';
      bannerDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 220px;">
          <span class="material-symbols-outlined" style="color: #d97706; font-size: 26px; margin-top: 2px;">assignment_late</span>
          <div>
            <strong style="color: #92400e; display: block; margin-bottom: 3px;">Tienes ${pendingReportShifts.length === 1 ? '1 informe de turno pendiente' : `${pendingReportShifts.length} informes de turno pendientes`}</strong>
            <span style="font-size: 0.9em; color: #78350f;">Por favor, completa tu Informe de Turno para compartir cuántas interacciones tuvieron y cualquier experiencia positiva.</span>
          </div>
        </div>
        <button type="button" onclick="openShiftReportModal('${firstPending.id}')" class="btn-action" style="background: #f59f00; color: white; white-space: nowrap;">
          <span class="material-symbols-outlined" style="font-size: 18px;">edit_note</span> Completar Informe
        </button>
      `;
      container.appendChild(bannerDiv);
    }

    if (myCurrentShifts.length > 0) {
      myCurrentShifts.forEach(shift => {
        const partnerRowsHtml = getPartnerRowsHtmlForMisTurnos(shift);
        const contactHtml = getShiftContactHtml(shift);
        const weatherHtml = getShiftWeatherBadgeHtml(shift);
        const shiftCard = document.createElement('div');
        shiftCard.className = 'shift-card mine';
        shiftCard.innerHTML = `
          <div class="shift-card-header" style="flex-wrap:wrap; gap:6px;">
            <h4 class="shift-card-title" style="color:#2c5282;"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">event</span>${formatSpanishDate(shift.date)}</h4>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span data-weather-shift-id="${shift.id}">${weatherHtml}</span>
              <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">schedule</span>${shift.time}</span>
            </div>
          </div>
          <p class="shift-card-detail" style="display:flex; justify-content:space-between; align-items:center;">
            <span><span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545; vertical-align:-3px;">location_on</span> <strong>${shift.location}</strong></span>
            <button onclick="openLocationInfoModal('${shift.locationId}', '${shift.location}')" style="background:none; border:none; color:#2c5282; font-size:0.9em; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:1.1em;">info</span> Info</button>
          </p>
          ${partnerRowsHtml}
          ${contactHtml}
          <div class="card-actions" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
             <button type="button" onclick="openCalendarModal('${shift.id}')" class="btn-action" style="flex: 1; min-width: 130px; background: #eef4ff; color: #2c5282; border: 1px solid #cdddf7;">
               <span class="material-symbols-outlined" style="font-size: 18px;">calendar_add_on</span> Agendar
             </button>
             ${isCurrentUserAdmin ? `
             <button type="button" onclick="openQuickLiveShiftEditModal('${shift.id}')" class="btn-action" style="flex: 1; min-width: 130px; background: #f8fafd; color: #2c5282; border: 1px solid #cbd5e0;">
               <span class="material-symbols-outlined" style="font-size: 18px;">manage_accounts</span> Editar Turno
             </button>
             ` : ''}
             <button type="button" onclick="attemptCancel('${shift.id}', '${shift.date}', '${shift.time}', '${shift.location}')" class="btn-action btn-danger" style="flex: 1; min-width: 130px;">
               Cancelar Turno
             </button>
          </div>
        `;
        container.appendChild(shiftCard);
      });
    } else {
      const noUpcoming = document.createElement('div');
      noUpcoming.style.cssText = 'text-align:center; padding: 25px 10px; background: white; border-radius: 10px; border: 1px dashed #ccc; margin-bottom: 20px;';
      noUpcoming.innerHTML = '<p style="color:#666; margin:0;">No tienes próximos turnos asignados.</p>';
      container.appendChild(noUpcoming);
    }

    if (recentFinishedShifts.length > 0) {
      const finishedHeader = document.createElement('div');
      finishedHeader.style.cssText = 'margin: 25px 0 12px 0; padding: 0 5px; display: flex; align-items: center; gap: 8px;';
      finishedHeader.innerHTML = `<h4 style="margin: 0; color: #444; font-size: 1.1em; display: flex; align-items: center; gap: 6px;"><span class="material-symbols-outlined" style="color: #5d7aa9; font-size: 20px;">task_alt</span> Turnos Recién Finalizados (Informe de Turno)</h4>`;
      container.appendChild(finishedHeader);

      recentFinishedShifts.forEach(shift => {
        const partnerRowsHtml = getPartnerRowsHtmlForMisTurnos(shift);
        const myReport = getMyReportForShift(shift);
        const repStatus = (myReport && myReport.reportStatus) || 'completed';
        const shiftCard = document.createElement('div');
        shiftCard.className = 'shift-card';
        const borderColor = !myReport ? '#f59f00' : (repStatus === 'cancelled' ? '#dc3545' : (repStatus === 'partner' ? '#5d7aa9' : '#28a745'));
        shiftCard.style.borderLeft = `5px solid ${borderColor}`;

        let reportSummaryHtml = '';
        let actionBtnHtml = '';
        if (myReport) {
          if (repStatus === 'cancelled') {
            reportSummaryHtml = `
              <div style="background: #fff5f5; border: 1px solid #f5c6cb; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 0.9em; color: #721c24;">
                <div style="font-weight: 600; display: flex; align-items: center; gap: 5px;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #dc3545;">cancel</span>
                  Turno reportado como cancelado
                </div>
                ${myReport.comments ? `<p style="margin: 5px 0 0 0; color: #721c24; font-style: italic;">"${myReport.comments}"</p>` : ''}
              </div>
            `;
          } else if (repStatus === 'partner') {
            reportSummaryHtml = `
              <div style="background: #eef4ff; border: 1px solid #cdddf7; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 0.9em; color: #2c5282;">
                <div style="font-weight: 600; display: flex; align-items: center; gap: 5px;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #5d7aa9;">group</span>
                  Informe enviado por tu compañero(a)
                </div>
                ${myReport.comments ? `<p style="margin: 5px 0 0 0; color: #2c5282; font-style: italic;">"${myReport.comments}"</p>` : ''}
              </div>
            `;
          } else {
            reportSummaryHtml = `
              <div style="background: #f0f9f2; border: 1px solid #c3e6cb; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 0.9em; color: #155724;">
                <div style="font-weight: 600; display: flex; align-items: center; gap: 5px;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #28a745;">check_circle</span>
                  Informe enviado • Interacciones: ${myReport.interactions ?? 0}
                </div>
                ${myReport.comments ? `<p style="margin: 5px 0 0 0; color: #2d5738; font-style: italic;">"${myReport.comments}"</p>` : ''}
              </div>
            `;
          }
          actionBtnHtml = `<button type="button" onclick="openShiftReportModal('${shift.id}')" class="btn-action" style="width: 100%; background: #eef2f7; color: #2c5282; border: 1px solid #cdd8e6;"><span class="material-symbols-outlined" style="font-size: 18px;">edit</span> Ver / Editar Informe</button>`;
        } else {
          actionBtnHtml = `<button type="button" onclick="openShiftReportModal('${shift.id}')" class="btn-action" style="width: 100%; background: #5d7aa9; color: white;"><span class="material-symbols-outlined" style="font-size: 18px;">assignment</span> Completar Informe de Turno</button>`;
        }

        shiftCard.innerHTML = `
          <div class="shift-card-header">
            <h4 class="shift-card-title" style="color:#333;"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px; color: ${borderColor};">event_available</span>${formatSpanishDate(shift.date)}</h4>
            <span class="shift-card-time"><span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: -3px; margin-right: 5px;">schedule</span>${shift.time}</span>
          </div>
          <p class="shift-card-detail">
            <span class="material-symbols-outlined" style="font-size: 1.2em; color: #dc3545;">location_on</span> <strong>${shift.location}</strong>
          </p>
          ${partnerRowsHtml}
          ${reportSummaryHtml}
          <div class="card-actions" style="margin-top: 12px; border-top: 1px solid #f0f0f0; padding-top: 10px;">
            ${actionBtnHtml}
          </div>
        `;
        container.appendChild(shiftCard);
      });
    }

    // Personal Shift History Section (Collapsible at bottom of Mis Turnos)
    if (allFinishedShifts.length > 0) {
      let totalInteractions = 0;
      allFinishedShifts.forEach(s => {
        const rep = getMyReportForShift(s);
        if (rep && (!rep.reportStatus || rep.reportStatus === 'completed') && typeof rep.interactions === 'number') {
          totalInteractions += rep.interactions;
        }
      });

      const historySection = document.createElement('div');
      historySection.style.cssText = 'margin-top: 28px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.03);';

      const historyItemsHtml = allFinishedShifts.map(s => {
        const others = (s.participants || []).filter(id => id && id !== "Disponible" && id !== currentUserPublisherId).map(id => publisherCache[id]?.name || 'Desconocido');
        const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';
        const rep = getMyReportForShift(s);
        const repStatus = (rep && rep.reportStatus) || 'completed';
        let repBadge = '';
        let leftColor = '#cbd5e0';
        if (rep) {
          if (repStatus === 'cancelled') {
            repBadge = `<span style="background:#fde8e8; color:#9b1c1c; padding:3px 9px; border-radius:12px; font-size:0.78em; font-weight:700;">❌ Turno cancelado</span>`;
            leftColor = '#dc3545';
          } else if (repStatus === 'partner') {
            repBadge = `<span style="background:#eef4ff; color:#2c5282; padding:3px 9px; border-radius:12px; font-size:0.78em; font-weight:700;">🤝 Informe por compañero(a)</span>`;
            leftColor = '#5d7aa9';
          } else {
            repBadge = `<span style="background:#e6f4ea; color:#155724; padding:3px 9px; border-radius:12px; font-size:0.78em; font-weight:700;">🤝 ${rep.interactions ?? 0} ${rep.interactions === 1 ? 'interacción' : 'interacciones'}</span>`;
            leftColor = '#28a745';
          }
        } else {
          repBadge = `<button type="button" onclick="openShiftReportModal('${s.id}')" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:3px 9px; border-radius:12px; font-size:0.78em; font-weight:700; cursor:pointer;">Completar informe</button>`;
        }

        return `
          <div style="background:#f8fafc; border:1px solid #e9eef5; border-left:4px solid ${leftColor}; border-radius:8px; padding:11px 14px; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="color:#2c5282; font-size:0.93em;">${formatSpanishDate(s.date)} • ${s.time}</strong>
              ${repBadge}
            </div>
            <div style="font-size:0.86em; color:#4a5568;">
              📍 <strong>${s.location}</strong> &nbsp;|&nbsp; 👥 Con: ${partnerText}
            </div>
            ${rep && rep.comments ? `<div style="font-size:0.84em; color:#2d5738; font-style:italic; margin-top:2px;">"${rep.comments}"</div>` : ''}
          </div>
        `;
      }).join('');

      historySection.innerHTML = `
        <button type="button" onclick="toggleMyShiftHistory()" style="width:100%; background:#f8fafd; border:none; padding:15px 18px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; text-align:left;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="material-symbols-outlined" style="color:#5d7aa9; font-size:22px;">history</span>
            <span style="font-weight:700; color:#2c5282; font-size:1.02em;">Mi Historial de Turnos</span>
            <span style="background:#eef2f7; color:#2c5282; padding:3px 9px; border-radius:12px; font-size:0.8em; font-weight:700;">${allFinishedShifts.length} ${allFinishedShifts.length === 1 ? 'turno' : 'turnos'}</span>
            <span style="background:#e6f4ea; color:#155724; padding:3px 9px; border-radius:12px; font-size:0.8em; font-weight:700;">🤝 ${totalInteractions} ${totalInteractions === 1 ? 'interacción' : 'interacciones'}</span>
          </div>
          <span id="my-history-chevron" class="material-symbols-outlined" style="color:#5d7aa9; font-size:24px;">${myHistoryExpanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        <div id="my-history-collapsible-body" style="display:${myHistoryExpanded ? 'flex' : 'none'}; flex-direction:column; gap:10px; padding:15px 18px; border-top:1px solid #edf2f7;">
          ${historyItemsHtml}
        </div>
      `;
      container.appendChild(historySection);
    }
  } catch (error) {
    console.error("Error loading my shifts:", error);
    container.innerHTML = '<p style="color:#dc3545; text-align:center;">Error al cargar tus turnos.</p>';
  }
}

let currentReportStatus = 'completed';

function selectReportStatus(status) {
  currentReportStatus = status || 'completed';
  const btnCompleted = document.getElementById('rep-opt-completed');
  const btnPartner = document.getElementById('rep-opt-partner');
  const btnCancelled = document.getElementById('rep-opt-cancelled');
  const interactionsGroup = document.getElementById('report-interactions-group');
  const noteEl = document.getElementById('report-status-note');
  const commentsLabel = document.getElementById('report-comments-label');

  const resetBtn = (btn) => {
    if (!btn) return;
    btn.style.border = '1px solid #dce4ee';
    btn.style.background = '#fff';
    btn.style.color = '#333';
  };
  resetBtn(btnCompleted);
  resetBtn(btnPartner);
  resetBtn(btnCancelled);

  if (currentReportStatus === 'partner') {
    if (btnPartner) {
      btnPartner.style.border = '2px solid #5d7aa9';
      btnPartner.style.background = '#eef4ff';
      btnPartner.style.color = '#2c5282';
    }
    if (interactionsGroup) interactionsGroup.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.style.background = '#eef4ff';
      noteEl.style.borderColor = '#cdddf7';
      noteEl.style.color = '#2c5282';
      noteEl.innerHTML = '🤝 <strong>Tu compañero(a) cargará las interacciones del turno.</strong> Tu informe quedará marcado como completado sin duplicar el conteo.';
    }
    if (commentsLabel) commentsLabel.innerText = 'Comentarios adicionales (Opcional)';
  } else if (currentReportStatus === 'cancelled') {
    if (btnCancelled) {
      btnCancelled.style.border = '2px solid #dc3545';
      btnCancelled.style.background = '#fff5f5';
      btnCancelled.style.color = '#721c24';
    }
    if (interactionsGroup) interactionsGroup.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.style.background = '#fff5f5';
      noteEl.style.borderColor = '#f5c6cb';
      noteEl.style.color = '#721c24';
      noteEl.innerHTML = '❌ <strong>Se registrará que este turno fue cancelado.</strong> No es necesario indicar un motivo.';
    }
    if (commentsLabel) commentsLabel.innerText = 'Comentario opcional';
  } else {
    if (btnCompleted) {
      btnCompleted.style.border = '2px solid #28a745';
      btnCompleted.style.background = '#f0f9f2';
      btnCompleted.style.color = '#155724';
    }
    if (interactionsGroup) interactionsGroup.style.display = 'block';
    if (noteEl) noteEl.style.display = 'none';
    if (commentsLabel) commentsLabel.innerText = 'Comentarios o experiencias positivas (Opcional)';
  }
}

function openShiftReportModal(shiftId) {
  const shift = myAllAssignedShifts.find(s => s.id === shiftId);
  if (!shift) {
    showToast("No se encontró la información del turno.", "error");
    return;
  }
  document.getElementById('report-shift-id').value = shiftId;
  const others = (shift.participants || []).filter(id => id && id !== "Disponible" && id !== currentUserPublisherId).map(id => publisherCache[id]?.name || 'Desconocido');
  const partnerText = others.length > 0 ? others.join(', ') : (shiftId === '__demo_report_shift__' ? 'Compañero de Ejemplo' : 'Solo/a');

  document.getElementById('report-shift-summary').innerHTML = `
    <div><strong>Fecha:</strong> ${formatSpanishDate(shift.date)} (${shift.time})</div>
    <div><strong>Ubicación:</strong> ${shift.location}</div>
    <div><strong>Compañero(a):</strong> ${partnerText}</div>
  `;

  const existingReport = getMyReportForShift(shift);
  const initialStatus = (existingReport && existingReport.reportStatus) || 'completed';
  selectReportStatus(initialStatus);
  document.getElementById('report-interactions').value = existingReport && existingReport.interactions !== undefined ? existingReport.interactions : 0;
  document.getElementById('report-comments').value = existingReport && existingReport.comments ? existingReport.comments : '';

  document.getElementById('shift-report-modal').style.display = 'flex';
}

function closeShiftReportModal() {
  document.getElementById('shift-report-modal').style.display = 'none';
}

async function saveShiftReport() {
  const shiftId = document.getElementById('report-shift-id').value;
  if (!shiftId || !currentUserPublisherId) return;

  const shift = myAllAssignedShifts.find(s => s.id === shiftId);
  const interactionsRaw = document.getElementById('report-interactions').value;
  const interactions = currentReportStatus === 'completed' ? Math.max(0, parseInt(interactionsRaw, 10) || 0) : 0;
  const comments = document.getElementById('report-comments').value.trim();
  const btn = document.getElementById('btn-save-report');
  btn.disabled = true;

  try {
    const others = ((shift && shift.participants) || []).filter(id => id && id !== "Disponible" && id !== currentUserPublisherId).map(id => publisherCache[id]?.name || 'Desconocido');
    const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';

    const reportPayload = {
      shiftId: shiftId,
      date: shift ? shift.date : '',
      time: shift ? shift.time : '',
      location: shift ? shift.location : '',
      partnerText: partnerText,
      publisherId: currentUserPublisherId,
      publisherName: publisherCache[currentUserPublisherId]?.name || '',
      reportStatus: currentReportStatus,
      interactions: interactions,
      comments: comments,
      updatedAt: new Date().toISOString()
    };

    if (shiftId === '__demo_report_shift__' && demoReportShift) {
      demoReportShift.reports[currentUserPublisherId] = reportPayload;
      closeShiftReportModal();
      showToast("¡Informe de prueba guardado (solo en vista previa)!");
      await loadMyShifts();
      return;
    }

    try {
      await db.collection('publishers').doc(currentUserPublisherId).update({
        [`shiftReports.${shiftId}`]: reportPayload
      });
    } catch (permErr) {
      console.warn("Direct shiftReports update rejected by rules; using absences fallback:", permErr);
      await updatePublisherMetaViaAbsencesFallback(currentUserPublisherId, (metaList) => {
        const filtered = metaList.filter(m => !(m._metaType === 'report' && m.shiftId === shiftId));
        filtered.push({
          _metaType: 'report',
          shiftId: shiftId,
          report: reportPayload
        });
        return filtered;
      });
    }

    if (!currentPubData) currentPubData = {};
    if (!currentPubData.shiftReports) currentPubData.shiftReports = {};
    currentPubData.shiftReports[shiftId] = reportPayload;

    closeShiftReportModal();
    showToast("¡Informe de turno guardado! Muchas gracias.");
    await loadMyShifts();
  } catch (err) {
    console.error("Error al guardar informe:", err);
    showToast("Error al guardar el informe: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function attemptCancel(shiftId, dateStr, timeStr, locationName) {
  const startTime = timeStr.split('-')[0].trim();
  const shiftDateTime = new Date(`${dateStr}T${startTime}:00`);
  const now = new Date();

  if (((shiftDateTime - now) / (1000 * 60 * 60)) < 24) { showToast("No puedes cancelar con menos de 24 horas. Comunícate con los encargados.", "error"); return; }

  const isConfirmed = await showConfirm(`¿Estás seguro de que deseas cancelar tu turno el ${formatSpanishDate(dateStr)}?`, "Cancelar Turno", "#dc3545");
  if(!isConfirmed) return;

  try {
    const nowIso = new Date().toISOString();
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    const shiftData = docSnap.data() || {};
    let currentParticipants = shiftData.participants || [];
    currentParticipants = currentParticipants.filter(id => id !== currentUserPublisherId);

    // Only update participants on shifts/{shiftId} to comply with Firestore Security Rules
    await shiftRef.update({
      participants: currentParticipants
    });

    // Preserve any existing legacy lastCancelledShift and increment cancellation count on publishers/{id}
    const pubRef = db.collection('publishers').doc(currentUserPublisherId);
    const pubSnap = await pubRef.get();
    const pubData = pubSnap.exists ? normalizePublisherData(pubSnap.data()) : (currentPubData || {});
    let history = Array.isArray(pubData.cancellationHistory) ? [...pubData.cancellationHistory] : [];

    if (history.length === 0 && pubData.lastCancelledShift) {
      history.push({
        shiftId: 'legacy',
        date: pubData.lastCancelledShift.split('T')[0],
        time: '',
        location: 'Cancelación anterior registrada',
        cancelledAt: pubData.lastCancelledShift,
        isLegacy: true
      });
    }

    const baseCount = typeof pubData.cancelledCount === 'number'
      ? pubData.cancelledCount
      : (pubData.lastCancelledShift ? Math.max(1, history.length) : history.length);
    const newCancelledCount = baseCount + 1;

    const newCancelEntry = {
      shiftId: shiftId,
      date: dateStr,
      time: timeStr,
      location: locationName,
      cancelledAt: nowIso
    };
    history.push(newCancelEntry);

    try {
      await pubRef.update({
        lastCancelledShift: nowIso,
        cancelledCount: newCancelledCount,
        cancellationHistory: history
      });
    } catch (cancelPermErr) {
      console.warn("Direct cancellationHistory update rejected by rules; using absences fallback:", cancelPermErr);
      await updatePublisherMetaViaAbsencesFallback(currentUserPublisherId, (metaList) => {
        metaList.push({
          _metaType: 'cancel',
          cancelEntry: newCancelEntry
        });
        return metaList;
      }, { lastCancelledShift: nowIso });
    }

    if (currentPubData) {
      currentPubData.lastCancelledShift = nowIso;
      currentPubData.cancelledCount = newCancelledCount;
      currentPubData.cancellationHistory = history;
    }

    showToast("Turno cancelado exitosamente.");
    loadMyShifts(); loadAvailableShifts(); loadShifts();
  } catch (err) { showToast("Error al cancelar: " + err.message, "error"); }
}

async function loadAvailableShifts() {
  if (!currentUserPublisherId && !isCurrentUserAdmin) return;
  const container = document.getElementById('open-shifts-container');
  const banner = document.getElementById('trainee-warning');

  const isTrainee = currentPubData ? currentPubData.status === 'Entrenamiento' : false;
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
      const realParticipants = participants.filter(id => id && id !== "Disponible");

      const alreadyInShift = currentUserPublisherId ? realParticipants.includes(currentUserPublisherId) : false;
      if (realParticipants.length < capacity && (!alreadyInShift || isCurrentUserAdmin) && shift.date >= todayStr) {
          openShifts.push(shift);
      }
    });

    if (openShifts.length === 0) { container.innerHTML = '<div style="text-align:center; padding: 30px 10px; background: white; border-radius: 10px; border: 1px dashed #ccc;"><p style="color:#666; margin:0;">No hay turnos libres en este momento.</p></div>'; return; }

    container.innerHTML = '';
    openShifts.forEach(shift => {
      const realParticipants = (shift.participants || []).filter(id => id && id !== "Disponible");
      const names = realParticipants.map(id => publisherCache[id]?.name || 'Alguien').join(', ') || 'Vacío';
      const capacity = shift.capacity || 2;
      const availableSpots = capacity - realParticipants.length;
      const contactHtml = getShiftContactHtml(shift);
      const alreadyInShift = currentUserPublisherId ? realParticipants.includes(currentUserPublisherId) : false;

      const card = document.createElement('div');
      card.className = 'shift-card open';

      let actionButton = '';
      if (currentUserPublisherId && !alreadyInShift) {
        actionButton = isTrainee
          ? `<button disabled class="btn-action" style="flex:1; min-width:140px; background:#e9ecef; color:#888; cursor:not-allowed; border: 1px solid #ddd;">Requiere Aprobación</button>`
          : `<button onclick="claimShift('${shift.id}', '${shift.date}', '${shift.time}', ${capacity})" class="btn-action btn-success" style="flex:1; min-width:140px;"><span class="material-symbols-outlined" style="font-size:18px;">add</span> Tomar Turno</button>`;
      }

      const adminQuickAssignBtn = isCurrentUserAdmin
        ? `<button type="button" onclick="openQuickLiveShiftEditModal('${shift.id}')" class="btn-action" style="flex:1; min-width:140px; background:#eef4ff; color:#2c5282; border:1px solid #cdddf7;"><span class="material-symbols-outlined" style="font-size:18px;">person_add</span> Asignar / Editar</button>`
        : '';

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
        <div class="card-actions" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 10px; display:flex; gap:8px; flex-wrap:wrap;">
           ${actionButton}
           ${adminQuickAssignBtn}
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
        const realParticipants = currentParticipants.filter(id => id && id !== "Disponible");

        // Safety check inside the transaction
        if (realParticipants.length >= capacity) {
            throw new Error("CAPACIDAD_LLENA");
        }
        if (currentParticipants.includes(currentUserPublisherId)) {
            throw new Error("Ya estás anotado en este turno.");
        }

        // Add user and commit update. Replace first "Disponible" if exists.
        const disponibleIndex = currentParticipants.indexOf("Disponible");
        if (disponibleIndex !== -1) {
            currentParticipants[disponibleIndex] = currentUserPublisherId;
        } else {
            currentParticipants.push(currentUserPublisherId);
        }

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
function getBaseLocationName(name) {
  if (!name) return '';
  return name.trim().replace(/[\s\-_#()]*\d+\)?\s*$/, '').trim() || name.trim();
}

async function loadAvailabilityForm() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('availability-form-container');
  try {
    const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
    const myAvail = pubDoc.data().availability || [];
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const groupedMap = { 'Lunes': {}, 'Martes': {}, 'Miércoles': {}, 'Jueves': {}, 'Viernes': {}, 'Sábado': {}, 'Domingo': {} };
    
    locSnapshot.forEach(doc => {
      const loc = doc.data();
      const locId = doc.id;
      const baseName = getBaseLocationName(loc.name);

      (loc.templates || []).forEach(t => {
        if (groupedMap[t.day] !== undefined) {
            const availKey = `${locId}_${t.day}_${t.startTime}`;
            const timeLabel = `${t.startTime} - ${t.endTime}`;
            const slotGroupKey = `${baseName.toLowerCase()}__${t.startTime}_${t.endTime}`;
            
            if (!groupedMap[t.day][slotGroupKey]) {
                groupedMap[t.day][slotGroupKey] = {
                    baseName: baseName,
                    originalNames: [loc.name],
                    time: timeLabel,
                    keys: [availKey]
                };
            } else {
                if (!groupedMap[t.day][slotGroupKey].keys.includes(availKey)) {
                    groupedMap[t.day][slotGroupKey].keys.push(availKey);
                    groupedMap[t.day][slotGroupKey].originalNames.push(loc.name);
                }
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
        const div = document.createElement('div'); div.className = 'day-group';
        let html = `<h4 class="day-title">${day}</h4>`;
        slots.forEach(s => {
            const displayName = s.keys.length > 1 ? s.baseName : s.originalNames[0];
            const isChecked = s.keys.some(k => myAvail.includes(k));
            const combinedVal = s.keys.join(',');
            const domId = `chk-${s.keys[0]}`;
            html += `<div class="shift-option"><input type="checkbox" id="${domId}" class="avail-checkbox" value="${combinedVal}" ${isChecked ? 'checked' : ''}><label for="${domId}"><strong>${displayName}</strong> (${s.time})</label></div>`;
        });
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
  const selectedSet = new Set();
  document.querySelectorAll('.avail-checkbox:checked').forEach(cb => {
      cb.value.split(',').forEach(k => { if (k.trim()) selectedSet.add(k.trim()); });
  });
  const selected = Array.from(selectedSet);
  try {
    await db.collection('publishers').doc(currentUserPublisherId).update({
        availability: selected,
        lastProfileChange: new Date().toISOString()
    });
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

function compressAvatarDataUrl(file, size = 300) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = err => reject(err);
    };
    reader.onerror = err => reject(err);
  });
}

function renderProfileAvatarPreview() {
  const previewEl = document.getElementById('prof-avatar-preview');
  const nameEl = document.getElementById('prof-avatar-name');
  const statusEl = document.getElementById('prof-avatar-status');
  const removeBtn = document.getElementById('btn-remove-prof-photo');
  if (!previewEl) return;

  const fullName = publisherCache[currentUserPublisherId]?.name || `${currentPubData?.firstName || ''} ${currentPubData?.lastName || ''}`.trim() || 'Mi Perfil';
  const photoUrl = currentPubData?.photoUrl || publisherCache[currentUserPublisherId]?.photoUrl || '';

  if (nameEl) nameEl.innerText = fullName;

  if (photoUrl) {
    previewEl.style.background = '#eee';
    previewEl.style.cursor = 'pointer';
    previewEl.title = 'Toca para ver tu foto en grande';
    previewEl.onclick = () => openPhotoPreviewModal(currentUserPublisherId);
    previewEl.innerHTML = `<img src="${photoUrl}" alt="${getInitials(fullName)}" style="width:100%; height:100%; object-fit:cover; display:block;">`;
    if (statusEl) statusEl.innerHTML = '<span style="color:#28a745; font-weight:600;">✓ Foto activa (toca la foto para verla en grande)</span>';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    previewEl.style.background = getAvatarColor(currentUserPublisherId || fullName);
    previewEl.style.cursor = 'default';
    previewEl.title = '';
    previewEl.onclick = null;
    previewEl.innerHTML = `<span>${getInitials(fullName)}</span>`;
    if (statusEl) statusEl.innerText = 'Sin foto personalizada (se muestran tus iniciales)';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function handleProfilePhotoUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file || !currentUserPublisherId) return;
  try {
    showToast("Procesando tu foto de perfil...", "info");
    const dataUrl = await compressAvatarDataUrl(file, 300);
    try {
      await db.collection('publishers').doc(currentUserPublisherId).update({
        photoUrl: dataUrl,
        lastProfileChange: new Date().toISOString()
      });
    } catch (photoPermErr) {
      console.warn("Direct photoUrl update rejected by rules; using absences fallback:", photoPermErr);
      await updatePublisherMetaViaAbsencesFallback(currentUserPublisherId, (metaList) => {
        const filtered = metaList.filter(m => m._metaType !== 'photo');
        filtered.push({
          _metaType: 'photo',
          photoUrl: dataUrl,
          updatedAt: new Date().toISOString()
        });
        return filtered;
      });
    }
    if (!currentPubData) currentPubData = {};
    currentPubData.photoUrl = dataUrl;
    if (publisherCache[currentUserPublisherId]) {
      publisherCache[currentUserPublisherId].photoUrl = dataUrl;
    }
    renderProfileAvatarPreview();
    loadMyShifts();
    showToast("¡Foto de perfil actualizada con éxito!");
  } catch (err) {
    console.error("Error uploading profile photo:", err);
    showToast("Error al guardar la foto: " + err.message, "error");
  } finally {
    event.target.value = '';
  }
}

async function removeProfilePhoto() {
  if (!currentUserPublisherId) return;
  const ok = await showConfirm("¿Deseas quitar tu foto de perfil?", "Quitar Foto", "#dc3545");
  if (!ok) return;
  try {
    try {
      await db.collection('publishers').doc(currentUserPublisherId).update({
        photoUrl: '',
        lastProfileChange: new Date().toISOString()
      });
    } catch (photoPermErr) {
      console.warn("Direct photoUrl removal rejected by rules; using absences fallback:", photoPermErr);
      await updatePublisherMetaViaAbsencesFallback(currentUserPublisherId, (metaList) => {
        return metaList.filter(m => m._metaType !== 'photo');
      });
    }
    if (currentPubData) currentPubData.photoUrl = '';
    if (publisherCache[currentUserPublisherId]) {
      publisherCache[currentUserPublisherId].photoUrl = '';
    }
    renderProfileAvatarPreview();
    loadMyShifts();
    showToast("Foto de perfil eliminada.");
  } catch (err) {
    showToast("Error al quitar la foto: " + err.message, "error");
  }
}

function renderProfileAccountStatus() {
  const card = document.getElementById('prof-account-status-card');
  const icon = document.getElementById('prof-account-status-icon');
  const title = document.getElementById('prof-account-status-title');
  const desc = document.getElementById('prof-account-status-desc');
  const btn = document.getElementById('btn-toggle-account-active');
  if (!card || !btn) return;

  const isInactive = Boolean(currentPubData && currentPubData.isInactive);
  if (isInactive) {
    card.style.background = '#f8f9fa';
    card.style.borderColor = '#cbd5e0';
    if (icon) { icon.innerText = 'pause_circle'; icon.style.color = '#6c757d'; }
    if (title) { title.innerText = 'Cuenta Inactiva (En pausa indefinida)'; title.style.color = '#2d3748'; }
    if (desc) { desc.innerText = 'No recibirás turnos en el generador automático hasta que reactives tu cuenta. Tus horarios preferidos siguen guardados.'; desc.style.color = '#4a5568'; }
    btn.className = 'btn-action btn-success';
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">play_circle</span> Reactivar mi cuenta';
  } else {
    card.style.background = '#f0f9f2';
    card.style.borderColor = '#c3e6cb';
    if (icon) { icon.innerText = 'check_circle'; icon.style.color = '#28a745'; }
    if (title) { title.innerText = 'Cuenta Activa'; title.style.color = '#155724'; }
    if (desc) { desc.innerText = 'Estás incluido(a) normalmente en la programación mensual de turnos.'; desc.style.color = '#2d5738'; }
    btn.className = 'btn-action btn-danger';
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">pause_circle</span> Pausar mi cuenta';
  }
}

async function toggleMyAccountActiveStatus() {
  if (!currentUserPublisherId || !currentPubData) return;
  const currentlyInactive = Boolean(currentPubData.isInactive);
  const nextInactive = !currentlyInactive;

  const confirmMsg = nextInactive
    ? "¿Deseas marcar tu cuenta como Inactiva? Dejarás de recibir asignaciones automáticas de turnos por tiempo indefinido sin perder tus horarios marcados, y podrás reactivarla cuando quieras."
    : "¿Deseas volver a activar tu cuenta para recibir asignaciones de turnos nuevamente?";
  const okText = nextInactive ? "Pausar Cuenta" : "Reactivar Cuenta";
  const okColor = nextInactive ? "#dc3545" : "#28a745";

  const confirmed = await showConfirm(confirmMsg, okText, okColor);
  if (!confirmed) return;

  try {
    try {
      const cleanedMeta = Array.isArray(currentPubData._metaAbsences)
        ? currentPubData._metaAbsences.filter(m => m && m._metaType !== 'inactive')
        : [];
      const realAbs = Array.isArray(myAbsences)
        ? myAbsences.filter(item => item && !item._metaType && item.start && item.end)
        : [];
      await db.collection('publishers').doc(currentUserPublisherId).update({
        isInactive: nextInactive,
        absences: [...realAbs, ...cleanedMeta],
        lastProfileChange: new Date().toISOString()
      });
      currentPubData._metaAbsences = cleanedMeta;
    } catch (permErr) {
      console.warn("Direct isInactive update rejected by rules; using absences fallback:", permErr);
      await updatePublisherMetaViaAbsencesFallback(currentUserPublisherId, (metaList) => {
        const filtered = metaList.filter(m => m._metaType !== 'inactive');
        filtered.push({
          _metaType: 'inactive',
          isInactive: nextInactive,
          updatedAt: new Date().toISOString()
        });
        return filtered;
      });
    }

    currentPubData.isInactive = nextInactive;
    if (publisherCache[currentUserPublisherId]) {
      publisherCache[currentUserPublisherId].isInactive = nextInactive;
    }

    renderProfileAccountStatus();
    loadMyShifts();
    showToast(nextInactive ? "Tu cuenta ahora está en modo Inactivo (en pausa)." : "¡Tu cuenta ha sido reactivada con éxito!");
  } catch (err) {
    console.error("Error updating account active status:", err);
    showToast("Error al cambiar el estado de la cuenta: " + err.message, "error");
  }
}

async function loadProfileForm() {
  if (!currentUserPublisherId || !currentPubData) return;
  try {
    const pub = currentPubData;
    renderProfileAvatarPreview();
    renderProfileAccountStatus();

    // Check Notification Permission on load
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && pub.fcmToken) {
        document.getElementById('push-status-text').innerHTML = 'Estado: <span style="color:#28a745;">Activadas</span>';
        document.getElementById('btn-enable-push').style.display = 'none';
        document.getElementById('btn-disable-push').style.display = 'inline-flex';
    } else {
        // Ensures correct UI if they disabled it on another device, or if Notifications are not supported
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

    myAbsences = (pub.absences || []).filter(item => item && !item._metaType && item.start && item.end);
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

  const phoneVal = document.getElementById('prof-phone').value.trim();
  const ePhoneVal = document.getElementById('prof-emerg-phone').value.trim();
  const phoneRegex = /^\+\d+$/; // Must start with + followed by only digits

  if (phoneVal && !phoneRegex.test(phoneVal.replace(/\s/g, ''))) {
      showToast("El teléfono debe incluir el código de país (ej. +595).", "error"); return;
  }
  if (ePhoneVal && !phoneRegex.test(ePhoneVal.replace(/\s/g, ''))) {
      showToast("El teléfono de emergencia debe incluir el código de país (ej. +595).", "error"); return;
  }

  const partnerId = document.getElementById('prof-partner').value;
  let partnerName = "";
  if (partnerId) { partnerName = publisherCache[partnerId]?.name; }

  const metaAbsences = Array.isArray(currentPubData?._metaAbsences) ? currentPubData._metaAbsences : [];
  const absencesForFirestore = [...myAbsences, ...metaAbsences];

  const profileData = {
    phone: document.getElementById('prof-phone').value.trim(),
    notificationEmail: emailVal,
    emailNotificationsEnabled: document.getElementById('prof-email-notif').checked,
    emergencyName: document.getElementById('prof-emerg-name').value.trim(),
    emergencyPhone: document.getElementById('prof-emerg-phone').value.trim(),
    maxShifts: parseInt(document.getElementById('prof-max').value) || 5,
    partner: partnerId,
    partnerName: partnerName,
    hardPair: document.getElementById('prof-hardpair').checked,
    absences: absencesForFirestore,
    lastProfileChange: new Date().toISOString()
  };

  // Firestore throws errors if you attempt to save `undefined`.
  // Strip out any undefined properties from the payload.
  Object.keys(profileData).forEach(key => profileData[key] === undefined && delete profileData[key]);

  try {
    await db.collection('publishers').doc(currentUserPublisherId).update(profileData);

    originalProfileData = {
        phone: profileData.phone, email: profileData.notificationEmail, emailNotif: profileData.emailNotificationsEnabled, eName: profileData.emergencyName,
        ePhone: profileData.emergencyPhone, max: profileData.maxShifts.toString(), partner: profileData.partner,
        hard: profileData.hardPair, abs: JSON.stringify(myAbsences)
    };

    currentPubData = { ...currentPubData, ...profileData, absences: myAbsences, _metaAbsences: metaAbsences };
    checkProfileChanges();
    showToast("¡Perfil y ausencias actualizados con éxito!");
  } catch (error) {
    console.error("Error al guardar perfil:", error);
    showToast("Error al guardar perfil: " + error.message, "error");
  }
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

// ==========================================
// QUICK LIVE SHIFT PARTICIPANT EDITOR (ADMIN)
// ==========================================
let currentQuickEditShift = null;
let liveEditLocationsCache = null;

async function ensureLiveEditLocationsLoaded() {
    if (Array.isArray(liveEditLocationsCache) && liveEditLocationsCache.length > 0) {
        return liveEditLocationsCache;
    }
    if (typeof allActiveLocationsCache !== 'undefined' && Array.isArray(allActiveLocationsCache) && allActiveLocationsCache.length > 0) {
        liveEditLocationsCache = allActiveLocationsCache;
        return liveEditLocationsCache;
    }
    try {
        const snap = await db.collection('locations').get();
        const locs = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.isActive !== false) {
                locs.push({ ...d, id: doc.id });
            }
        });
        liveEditLocationsCache = locs;
    } catch (e) {
        console.warn("Could not load locations for live shift editor:", e);
        liveEditLocationsCache = [];
    }
    return liveEditLocationsCache;
}

function getLiveEquivAvailKeys(availKey, locationsList) {
    const baseKeySet = new Set([availKey]);
    if (!availKey || !Array.isArray(locationsList) || locationsList.length === 0) {
        return Array.from(baseKeySet);
    }
    const parts = availKey.split('_');
    if (parts.length < 3) return Array.from(baseKeySet);
    const locId = parts[0];
    const dayName = parts[1];
    const startTime = parts.slice(2).join('_');
    const targetLoc = locationsList.find(l => l.id === locId);
    if (!targetLoc || !targetLoc.name) return Array.from(baseKeySet);

    const normalizeBase = (n) => (n || '').trim().replace(/[\s\-_#()]*\d+\)?\s*$/, '').trim().toLowerCase();
    const targetBase = normalizeBase(targetLoc.name);

    locationsList.forEach(loc => {
        if (normalizeBase(loc.name) === targetBase) {
            baseKeySet.add(`${loc.id}_${dayName}_${startTime}`);
        }
    });
    return Array.from(baseKeySet);
}

function isPubAvailableForLiveShift(pub, shift) {
    if (!pub || !Array.isArray(pub.availability) || !shift || !shift.date || !shift.time) return false;
    const [y, m, d] = shift.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dateObj.getDay()];
    const startTime = shift.time.split('-')[0].trim();
    const availKey = `${shift.locationId}_${dayName}_${startTime}`;
    const equivKeys = getLiveEquivAvailKeys(availKey, liveEditLocationsCache || []);
    return equivKeys.some(k => pub.availability.includes(k));
}

function isPubAbsentOnDate(pub, dateStr) {
    if (!pub || !Array.isArray(pub.absences) || !dateStr) return false;
    return pub.absences.some(abs => abs && abs.start && abs.end && dateStr >= abs.start && dateStr <= abs.end);
}

function computeLiveMonthStats(monthPrefix) {
    const counts = {};
    const datesByPub = {};
    (allShiftsData || []).forEach(s => {
        if (!s || !s.date) return;
        const realIds = (s.participants || []).filter(id => id && id !== 'Disponible');
        realIds.forEach(id => {
            if (!datesByPub[id]) datesByPub[id] = new Set();
            datesByPub[id].add(s.date);
            if (monthPrefix && s.date.startsWith(monthPrefix)) {
                counts[id] = (counts[id] || 0) + 1;
            }
        });
    });
    return { counts, datesByPub };
}

function getAdjacentDates(dateStr) {
    if (!dateStr) return [];
    const [y, m, d] = dateStr.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    const next = new Date(y, m - 1, d + 1);
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return [fmt(prev), fmt(next)];
}

async function openQuickLiveShiftEditModal(shiftId) {
    if (!isCurrentUserAdmin) {
        showToast("Solo los administradores pueden editar turnos.", "error");
        return;
    }
    const modal = document.getElementById('quick-live-shift-modal');
    if (!modal) return;

    syncPublisherCacheFromAdmin();
    await ensureLiveEditLocationsLoaded();

    const idInput = document.getElementById('quick-edit-shift-id');
    if (idInput) idInput.value = shiftId;
    const searchInput = document.getElementById('quick-edit-pub-search');
    if (searchInput) searchInput.value = '';

    let shiftData = allShiftsData.find(s => s.id === shiftId);
    try {
        const docSnap = await db.collection('shifts').doc(shiftId).get();
        if (docSnap.exists) {
            shiftData = { id: docSnap.id, ...docSnap.data() };
        }
    } catch (e) {
        console.error("Error fetching shift for quick edit:", e);
    }

    if (!shiftData) {
        showToast("No se encontró el turno seleccionado.", "error");
        return;
    }

    if (shiftData.requiresManager === undefined && Array.isArray(liveEditLocationsCache)) {
        const locObj = liveEditLocationsCache.find(l => l.id === shiftData.locationId || l.name === shiftData.location);
        if (locObj) shiftData.requiresManager = Boolean(locObj.requiresManager);
    }

    currentQuickEditShift = shiftData;
    renderQuickLiveShiftModalContent();
    modal.style.display = 'flex';
}

function closeQuickLiveShiftEditModal() {
    const modal = document.getElementById('quick-live-shift-modal');
    if (modal) modal.style.display = 'none';
    currentQuickEditShift = null;
}

function renderQuickLiveShiftModalContent() {
    if (!currentQuickEditShift) return;
    const shift = currentQuickEditShift;
    const capacity = shift.capacity || 2;
    const participants = (shift.participants || []).filter(id => id && id !== 'Disponible');

    const hasAssignedManager = participants.some(id => publisherCache[id]?.isShiftManager === true);
    const managerWarningHtml = (shift.requiresManager && !hasAssignedManager)
        ? `<div style="margin-top:6px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:5px 10px; border-radius:6px; font-size:0.84em; font-weight:600; display:inline-flex; align-items:center; gap:5px;">
             <span class="material-symbols-outlined" style="font-size:16px;">warning</span> Este punto requiere un Encargado de Turno físico
           </div>`
        : '';

    const subtitleEl = document.getElementById('quick-edit-shift-summary');
    if (subtitleEl) {
        subtitleEl.innerHTML = `<div><strong>📍 ${shift.location}</strong></div><div>📅 ${formatSpanishDate(shift.date)} • ⏰ ${shift.time}</div>${managerWarningHtml}`;
    }

    const countEl = document.getElementById('quick-edit-shift-count');
    if (countEl) {
        countEl.innerText = `${participants.length}/${capacity}`;
    }

    const listEl = document.getElementById('quick-edit-shift-assigned');
    if (listEl) {
        if (participants.length === 0) {
            listEl.innerHTML = '<div style="padding:12px; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; text-align:center; color:#777; font-size:0.9em;">Ningún publicador asignado todavía.</div>';
        } else {
            listEl.innerHTML = participants.map(pubId => {
                const pub = publisherCache[pubId] || {};
                const name = pub.name || 'Desconocido';
                const badges = [];
                if (pub.isShiftManager) {
                    badges.push('<span style="background:#eef4ff; color:#2c5282; border:1px solid #cdddf7; font-size:0.75em; padding:1px 6px; border-radius:10px; font-weight:600; margin-left:6px;">👮 Encargado</span>');
                }
                if (pub.status === 'Entrenamiento') {
                    badges.push('<span style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; font-size:0.75em; padding:1px 6px; border-radius:10px; font-weight:600; margin-left:6px;">⚠️ Entrenamiento</span>');
                }
                if (pub.hardPair && pub.partner) {
                    const partnerInShift = participants.includes(pub.partner);
                    badges.push(`<span style="background:${partnerInShift ? '#e6f4ea' : '#fff5f5'}; color:${partnerInShift ? '#155724' : '#dc3545'}; border:1px solid ${partnerInShift ? '#c3e6cb' : '#f5c6cb'}; font-size:0.75em; padding:1px 6px; border-radius:10px; font-weight:600; margin-left:6px;">💑 Pareja Estricta</span>`);
                }
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; background:#f8fafd; border:1px solid #e2e8f0; border-radius:8px; gap:8px;">
                        <span style="font-weight:600; color:#2d3748; font-size:0.94em; display:flex; align-items:center; flex-wrap:wrap;">
                            <span class="material-symbols-outlined" style="font-size:18px; color:#5d7aa9; margin-right:6px;">person</span>
                            ${name}${badges.join('')}
                        </span>
                        <button type="button" onclick="quickRemovePublisherFromLiveShift('${pubId}')" style="background:#fff5f5; color:#dc3545; border:1px solid #f5c6cb; border-radius:6px; padding:5px 9px; cursor:pointer; font-size:0.82em; font-weight:600; display:inline-flex; align-items:center; gap:3px; flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:16px;">person_remove</span> Quitar
                        </button>
                    </div>
                `;
            }).join('');
        }
    }

    filterQuickLiveShiftPublisherOptions();
}

function filterQuickLiveShiftPublisherOptions() {
    const select = document.getElementById('quick-edit-pub-select');
    if (!select || !currentQuickEditShift) return;

    const shift = currentQuickEditShift;
    const monthPrefix = (shift.date || '').substring(0, 7);
    const { counts, datesByPub } = computeLiveMonthStats(monthPrefix);
    const [prevDateStr, nextDateStr] = getAdjacentDates(shift.date);

    const query = (document.getElementById('quick-edit-pub-search')?.value || '').trim().toLowerCase();
    const assignedList = (shift.participants || []).filter(id => id && id !== 'Disponible');
    const assignedSet = new Set(assignedList);

    // Deduplicate by normalized name+id and ignore any numeric index keys
    const seenIds = new Set();
    const allPubEntries = Object.entries(publisherCache)
        .filter(([id, pub]) => {
            if (!id || /^\d+$/.test(id) || seenIds.has(id)) return false;
            if (assignedSet.has(id) || !pub || !pub.name) return false;
            if (query && !pub.name.toLowerCase().includes(query)) return false;
            seenIds.add(id);
            return true;
        });

    if (allPubEntries.length === 0) {
        select.innerHTML = '<option value="">-- No se encontraron publicadores --</option>';
        return;
    }

    const availableApproved = [];
    const trainees = [];
    const others = [];

    allPubEntries.forEach(([id, pub]) => {
        const monthCount = counts[id] || 0;
        const maxShifts = pub.maxShifts || 5;
        const pubDates = datesByPub[id] || new Set();
        const sameDay = pubDates.has(shift.date);
        const adjacentDay = !sameDay && ((prevDateStr && pubDates.has(prevDateStr)) || (nextDateStr && pubDates.has(nextDateStr)));
        const isAway = isPubAbsentOnDate(pub, shift.date);
        const isAvailSlot = isPubAvailableForLiveShift(pub, shift);
        const isPreferredOfAssigned = assignedList.some(aId => {
            const aPub = publisherCache[aId];
            return (aPub && aPub.partner === id) || pub.partner === aId;
        });

        const item = {
            id,
            pub,
            monthCount,
            maxShifts,
            sameDay,
            adjacentDay,
            isAway,
            isAvailSlot,
            isPreferredOfAssigned
        };

        if (pub.isInactive) {
            others.push(item);
        } else if (isAway) {
            others.push(item);
        } else if (pub.status === 'Entrenamiento') {
            trainees.push(item);
        } else if (isAvailSlot) {
            availableApproved.push(item);
        } else {
            others.push(item);
        }
    });

    // Sort Available Approved: preferred partner of assigned first, then fewest monthly shifts, then alphabetical
    availableApproved.sort((a, b) => {
        if (a.isPreferredOfAssigned !== b.isPreferredOfAssigned) return a.isPreferredOfAssigned ? -1 : 1;
        if (a.sameDay !== b.sameDay) return a.sameDay ? 1 : -1;
        if (a.monthCount !== b.monthCount) return a.monthCount - b.monthCount;
        return a.pub.name.localeCompare(b.pub.name);
    });

    trainees.sort((a, b) => {
        if (a.isAvailSlot !== b.isAvailSlot) return a.isAvailSlot ? -1 : 1;
        if (a.monthCount !== b.monthCount) return a.monthCount - b.monthCount;
        return a.pub.name.localeCompare(b.pub.name);
    });

    others.sort((a, b) => {
        if (!!a.pub.isInactive !== !!b.pub.isInactive) return a.pub.isInactive ? 1 : -1;
        if (a.isAway !== b.isAway) return a.isAway ? 1 : -1;
        return a.pub.name.localeCompare(b.pub.name);
    });

    const formatOptionLabel = (item, category) => {
        const { pub, monthCount, maxShifts, sameDay, adjacentDay, isAway, isAvailSlot, isPreferredOfAssigned } = item;
        const shiftCounter = `(${monthCount}/${maxShifts}t)`;
        const tags = [];
        if (isPreferredOfAssigned) tags.push('💑 Compañero en turno');
        else if (pub.hardPair && pub.partnerName) tags.push(`💑 Pareja estricta: ${pub.partnerName}`);
        if (pub.isShiftManager) tags.push('👮 Encargado');
        if (sameDay) tags.push('📅 Ya tiene turno hoy');
        else if (adjacentDay) tags.push('📅 Día consecutivo');

        if (category === 'available') {
            const suffix = tags.length > 0 ? ` • ${tags.join(' • ')}` : '';
            return `<option value="${item.id}">✅ ${pub.name} ${shiftCounter}${suffix}</option>`;
        }
        if (category === 'trainee') {
            const availTag = isAvailSlot ? 'Disponible en horario' : 'Otro horario';
            const suffix = tags.length > 0 ? ` • ${tags.join(' • ')}` : '';
            return `<option value="${item.id}">⚠️ ${pub.name} ${shiftCounter} [${availTag}]${suffix}</option>`;
        }
        // others
        let reason = '❌ Otro horario';
        if (pub.isInactive) reason = '⏸️ Inactivo';
        else if (isAway) reason = '✈️ Vacaciones';
        const suffix = tags.length > 0 ? ` • ${tags.join(' • ')}` : '';
        return `<option value="${item.id}">${reason} — ${pub.name} ${shiftCounter}${suffix}</option>`;
    };

    let html = `<option value="">-- Seleccionar publicador (${allPubEntries.length}) --</option>`;
    if (availableApproved.length > 0) {
        html += `<optgroup label="✅ Disponibles en este horario (${availableApproved.length})">` +
            availableApproved.map(it => formatOptionLabel(it, 'available')).join('') +
            `</optgroup>`;
    }
    if (trainees.length > 0) {
        html += `<optgroup label="⚠️ En Entrenamiento (${trainees.length})">` +
            trainees.map(it => formatOptionLabel(it, 'trainee')).join('') +
            `</optgroup>`;
    }
    if (others.length > 0) {
        html += `<optgroup label="❌ Otros horarios / Ausentes / Inactivos (${others.length})">` +
            others.map(it => formatOptionLabel(it, 'other')).join('') +
            `</optgroup>`;
    }

    select.innerHTML = html;
}

async function quickAddPublisherToLiveShift() {
    if (!isCurrentUserAdmin || !currentQuickEditShift) return;
    const select = document.getElementById('quick-edit-pub-select');
    const pubIdToAdd = select ? select.value : '';
    if (!pubIdToAdd) {
        showToast("Selecciona un publicador para agregar.", "error");
        return;
    }

    const shift = currentQuickEditShift;
    const shiftId = shift.id;
    const capacity = shift.capacity || 2;
    const currentRealParticipants = (shift.participants || []).filter(id => id && id !== 'Disponible');
    const pub = publisherCache[pubIdToAdd] || {};

    if (currentRealParticipants.length >= capacity) {
        const forceCap = await showConfirm(`⚠️ Este turno ya alcanzó su capacidad máxima (${capacity}/${capacity}). ¿Deseas agregar a ${pub.name || 'este publicador'} de todos modos?`, "Forzar Adición", "#d97706");
        if (!forceCap) return;
    }

    // Evaluate smart scheduling warnings just like the draft workbench
    const monthPrefix = (shift.date || '').substring(0, 7);
    const { counts, datesByPub } = computeLiveMonthStats(monthPrefix);
    const [prevDateStr, nextDateStr] = getAdjacentDates(shift.date);
    const pubDates = datesByPub[pubIdToAdd] || new Set();
    const monthCount = counts[pubIdToAdd] || 0;
    const limit = pub.maxShifts || 5;

    const warnings = [];
    if (pub.isInactive) {
        warnings.push("⏸️ Está marcado como INACTIVO (En pausa de asignaciones).");
    }
    if (isPubAbsentOnDate(pub, shift.date)) {
        warnings.push("✈️ Está marcado como AUSENTE (Vacaciones) en esta fecha.");
    }
    if (pub.status === 'Entrenamiento') {
        warnings.push("⚠️ Está En Entrenamiento. Asegúrate de asignarlo junto con un capacitador.");
    }
    if (monthCount >= limit) {
        warnings.push(`📊 Ya alcanzó su límite mensual (${monthCount}/${limit} turnos en este mes).`);
    }
    if (pubDates.has(shift.date)) {
        warnings.push("📅 Ya tiene otro turno asignado en este mismo día.");
    } else if ((prevDateStr && pubDates.has(prevDateStr)) || (nextDateStr && pubDates.has(nextDateStr))) {
        warnings.push("📅 Trabajará en días consecutivos (tiene turno el día anterior o siguiente).");
    }
    if (pub.hardPair && pub.partner && !currentRealParticipants.includes(pub.partner)) {
        warnings.push(`💑 Tiene Pareja Estricta con ${pub.partnerName || 'su compañero(a)'}, quien aún no está en este turno.`);
    }

    if (warnings.length > 0) {
        const confirmWarn = await showConfirm(
            `⚠️ ADVERTENCIA al asignar a ${pub.name}:\n\n` + warnings.map(w => "• " + w).join("\n") + `\n\n¿Deseas asignarlo de todos modos?`,
            "Asignar de todos modos",
            "#d97706"
        );
        if (!confirmWarn) return;
    }

    try {
        const shiftRef = db.collection('shifts').doc(shiftId);
        const docSnap = await shiftRef.get();
        if (!docSnap.exists) {
            showToast("El turno ya no existe.", "error");
            return;
        }
        const data = docSnap.data() || {};
        const shiftCap = data.capacity || capacity;
        const realList = (data.participants || []).filter(id => id && id !== 'Disponible');
        if (realList.includes(pubIdToAdd)) {
            showToast("Este publicador ya está asignado al turno.", "info");
            return;
        }
        realList.push(pubIdToAdd);
        const paddedList = [...realList];
        while (paddedList.length < shiftCap) {
            paddedList.push("Disponible");
        }
        await shiftRef.update({ participants: paddedList });

        currentQuickEditShift.participants = paddedList;
        const idx = allShiftsData.findIndex(s => s.id === shiftId);
        if (idx !== -1) allShiftsData[idx].participants = paddedList;

        renderQuickLiveShiftModalContent();
        filterAllShifts();
        if (currentUserPublisherId) loadMyShifts();
        loadAvailableShifts();
        showToast(`Se agregó a ${pub.name || 'publicador'} al turno.`);
    } catch (e) {
        console.error("Error adding publisher to shift:", e);
        showToast("Error al agregar al turno: " + e.message, "error");
    }
}

async function quickRemovePublisherFromLiveShift(pubIdToRemove) {
    if (!isCurrentUserAdmin || !currentQuickEditShift) return;
    const pub = publisherCache[pubIdToRemove] || {};
    const pubName = pub.name || 'este publicador';
    const shift = currentQuickEditShift;
    const shiftId = shift.id;
    const currentReal = (shift.participants || []).filter(id => id && id !== 'Disponible');

    // Warn if separating a strict pair (Pareja Estricta)
    if (pub.hardPair && pub.partner && currentReal.includes(pub.partner)) {
        const ok1 = await showConfirm(`⚠️ ${pubName} forma una Pareja Estricta con ${pub.partnerName || 'su compañero(a)'} en este turno.\n\n¿Estás seguro de quitarlo y separar la pareja?`, "Separar y Quitar", "#dc3545");
        if (!ok1) return;
    } else {
        const strictPartnerOnShift = currentReal
            .filter(id => id !== pubIdToRemove)
            .map(id => publisherCache[id])
            .find(p => p && p.hardPair && p.partner === pubIdToRemove);
        if (strictPartnerOnShift) {
            const ok2 = await showConfirm(`⚠️ Estás quitando al compañero estricto de ${strictPartnerOnShift.name}.\n\n¿Deseas continuar?`, "Quitar de todos modos", "#dc3545");
            if (!ok2) return;
        }
    }

    try {
        const shiftRef = db.collection('shifts').doc(shiftId);
        const docSnap = await shiftRef.get();
        if (!docSnap.exists) {
            showToast("El turno ya no existe.", "error");
            return;
        }
        const data = docSnap.data() || {};
        const shiftCap = data.capacity || shift.capacity || 2;
        const realList = (data.participants || []).filter(id => id && id !== 'Disponible' && id !== pubIdToRemove);
        const paddedList = [...realList];
        while (paddedList.length < shiftCap) {
            paddedList.push("Disponible");
        }
        await shiftRef.update({ participants: paddedList });

        currentQuickEditShift.participants = paddedList;
        const idx = allShiftsData.findIndex(s => s.id === shiftId);
        if (idx !== -1) allShiftsData[idx].participants = paddedList;

        renderQuickLiveShiftModalContent();
        filterAllShifts();
        if (currentUserPublisherId) loadMyShifts();
        loadAvailableShifts();
        showToast(`Se quitó a ${pubName} del turno.`);
    } catch (e) {
        console.error("Error removing publisher from shift:", e);
        showToast("Error al quitar del turno: " + e.message, "error");
    }
}

async function quickDeleteLiveShift() {
    if (!isCurrentUserAdmin || !currentQuickEditShift) return;
    const shift = currentQuickEditShift;
    const confirmDelete = await showConfirm(
        `🗑️ ¿Estás seguro de ELIMINAR por completo este turno del calendario en vivo?\n\n📍 ${shift.location}\n📅 ${formatSpanishDate(shift.date)} • ${shift.time}\n\nEsta acción quitará el turno para todos los publicadores.`,
        "Eliminar Turno",
        "#dc3545"
    );
    if (!confirmDelete) return;

    try {
        await db.collection('shifts').doc(shift.id).delete();
        allShiftsData = allShiftsData.filter(s => s.id !== shift.id);
        closeQuickLiveShiftEditModal();
        filterAllShifts();
        if (currentUserPublisherId) loadMyShifts();
        loadAvailableShifts();
        if (typeof checkMonthStatus === 'function' && adminDashboardInitialized) {
            checkMonthStatus();
        }
        showToast("Turno eliminado del calendario en vivo.");
    } catch (e) {
        console.error("Error deleting live shift:", e);
        showToast("Error al eliminar el turno: " + e.message, "error");
    }
}

window.openLocationInfoModal = openLocationInfoModal;
window.closeLocationInfoModal = closeLocationInfoModal;
window.switchAppMode = switchAppMode;
window.syncPublisherCacheFromAdmin = syncPublisherCacheFromAdmin;
window.refreshPublisherLiveShiftsFromAdmin = refreshPublisherLiveShiftsFromAdmin;
window.openQuickLiveShiftEditModal = openQuickLiveShiftEditModal;
window.closeQuickLiveShiftEditModal = closeQuickLiveShiftEditModal;
window.filterQuickLiveShiftPublisherOptions = filterQuickLiveShiftPublisherOptions;
window.quickAddPublisherToLiveShift = quickAddPublisherToLiveShift;
window.quickRemovePublisherFromLiveShift = quickRemovePublisherFromLiveShift;
window.quickDeleteLiveShift = quickDeleteLiveShift;


