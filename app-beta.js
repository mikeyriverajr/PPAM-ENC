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

let publisherCache = {}; 
let currentUserPublisherId = null;
let originalProfileData = {};

// --- DATE FORMATTERS ---
const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// FIX 3: Bulletproof Spanish Date Formatter
function formatSpanishDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr; 
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const d = parseInt(parts[2]);
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
        
        if (userData.requirePasswordChange) {
            document.getElementById('force-password-modal').style.display = 'flex';
            document.getElementById('app-content').style.display = 'none';
        } else {
            document.getElementById('force-password-modal').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            
            const pubSnap = await db.collection('publishers').get();
            pubSnap.forEach(d => { publisherCache[d.id] = `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(); });
            
            document.getElementById('header-user-name').innerText = publisherCache[currentUserPublisherId] || "";
            
            loadShifts(); loadMyShifts(); loadAvailableShifts(); loadAvailabilityForm(); loadProfileForm(); 
        }
      }
    } catch (error) { console.error("Error:", error); }
  } else {
    document.getElementById('login-overlay').style.display = 'block';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('force-password-modal').style.display = 'none';
    currentUserPublisherId = null;
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

// ==========================================
// PASSWORD MANAGEMENT LOGIC
// ==========================================
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
      document.getElementById('header-user-name').innerText = publisherCache[currentUserPublisherId] || "";
      loadShifts(); loadMyShifts(); loadAvailableShifts(); loadAvailabilityForm(); loadProfileForm(); 
  } catch (error) {
      if(error.code === 'auth/requires-recent-login') { err.innerText = "Por favor cierra sesión y vuelve a ingresar para cambiar tu contraseña."; } 
      else { err.innerText = "Error al actualizar: " + error.message; }
  }
}

function checkPasswordChange() {
    const p = document.getElementById('prof-new-pass').value;
    const btn = document.getElementById('btn-update-pass');
    if (p.length >= 6) { btn.disabled = false; btn.style.background = '#6c757d'; btn.style.cursor = 'pointer'; } 
    else { btn.disabled = true; btn.style.background = '#ccc'; btn.style.cursor = 'not-allowed'; }
}

async function changeProfilePassword() {
  const p = document.getElementById('prof-new-pass').value;
  const msg = document.getElementById('prof-pass-msg');
  msg.innerText = "";
  if (p.length < 6) return;

  try {
      await auth.currentUser.updatePassword(p);
      msg.innerText = "¡Contraseña actualizada con éxito!"; msg.style.color = "green";
      document.getElementById('prof-new-pass').value = '';
      checkPasswordChange(); 
      setTimeout(() => msg.innerText = "", 3000);
  } catch (error) {
      if(error.code === 'auth/requires-recent-login') { msg.innerText = "Error: Cierra sesión y vuelve a ingresar antes de cambiar tu contraseña."; msg.style.color = "red"; } 
      else { msg.innerText = "Error: " + error.message; msg.style.color = "red"; }
  }
}

// ==========================================
// PROGRAMA & TURNOS LOGIC
// ==========================================
let allShiftsData = []; 
async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center;">Cargando programa...</p>';
  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    container.innerHTML = ''; allShiftsData = [];
    shiftsSnapshot.forEach(doc => { let shift = doc.data(); shift.id = doc.id; allShiftsData.push(shift); });
    renderAllShifts(allShiftsData);
  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar.</p>'; }
}

function renderAllShifts(shifts) {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '';
  if(shifts.length === 0) { container.innerHTML = '<p style="text-align:center;">No se encontraron turnos.</p>'; return; }
  shifts.forEach(shift => {
    const participantNames = (shift.participants || []).map(id => publisherCache[id] || 'Desconocido');
    const shiftCard = document.createElement('div');
    shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);";
    shiftCard.innerHTML = `
      <h3 style="margin: 0 0 8px 0; color: #5d7aa9; border-bottom: 1px solid #eee; padding-bottom: 8px; text-transform: capitalize;">📅 ${formatSpanishDate(shift.date)} | ⏰ ${shift.time}</h3>
      <p style="margin: 8px 0;"><strong>📍 Lugar:</strong> <span class="loc-text">${shift.location}</span></p>
      <p style="margin: 8px 0;"><strong>👥 Publicadores:</strong> <span class="pub-text">${participantNames.join(', ')}</span></p>
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
  const container = document.getElementById('tab-mine');
  container.innerHTML = '<p style="text-align:center;">Buscando tus turnos...</p>';
  try {
    const todayStr = getTodayString();
    const shiftsSnapshot = await db.collection('shifts').where('participants', 'array-contains', currentUserPublisherId).get();
    myCurrentShifts = [];
    shiftsSnapshot.forEach(doc => { 
        let s = doc.data(); 
        s.id = doc.id; 
        if (s.date >= todayStr) myCurrentShifts.push(s); 
    });
    
    if (myCurrentShifts.length === 0) {
      container.innerHTML = `<div style="background:white; padding:20px; text-align:center; border-radius:8px;"><h3 style="color:#666;">Sin turnos próximos asignados</h3></div>`;
      return;
    }
    
    container.innerHTML = '<h3 style="margin-top:0; color:#333; margin-bottom: 15px;">Tus Próximos Turnos</h3>';
    myCurrentShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

    myCurrentShifts.forEach(shift => {
      const others = (shift.participants || []).filter(id => id !== currentUserPublisherId).map(id => publisherCache[id] || 'Desconocido');
      const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';
      const shiftCard = document.createElement('div');
      shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 5px solid #28a745; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;";
      shiftCard.innerHTML = `
        <div><h4 style="margin: 0 0 8px 0; color: #28a745; text-transform: capitalize;">📅 ${formatSpanishDate(shift.date)} | ⏰ ${shift.time}</h4>
        <p style="margin: 5px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
        <p style="margin: 5px 0;"><strong>👥 Con:</strong> ${partnerText}</p></div>
        <button onclick="attemptCancel('${shift.id}', '${shift.date}', '${shift.time}', '${shift.location}')" class="btn-action btn-danger">Cancelar</button>
      `;
      container.appendChild(shiftCard);
    });
  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar.</p>'; }
}

async function loadAvailableShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('open-shifts-container');
  container.innerHTML = '<p style="text-align:center;">Buscando espacios libres...</p>';
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

    if (openShifts.length === 0) { container.innerHTML = '<p style="text-align:center; color:#666;">No hay espacios libres en este momento.</p>'; return; }

    container.innerHTML = '';
    openShifts.forEach(shift => {
      const names = (shift.participants || []).map(id => publisherCache[id] || 'Alguien').join(', ') || 'Vacío';
      const capacity = shift.capacity || 2;
      const availableSpots = capacity - (shift.participants || []).length;
      const card = document.createElement('div');
      card.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 5px solid #17a2b8; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;";
      card.innerHTML = `
        <div><h4 style="margin: 0 0 8px 0; color: #17a2b8; text-transform: capitalize;">📅 ${formatSpanishDate(shift.date)} | ⏰ ${shift.time}</h4>
        <p style="margin: 5px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
        <p style="margin: 5px 0; font-size:0.9em;"><strong>👥 Actuales:</strong> ${names}</p>
        <p style="margin: 5px 0; font-size:0.8em; color:#666;">Lugares libres: ${availableSpots}</p></div>
        <button onclick="claimShift('${shift.id}', '${shift.date}', '${shift.time}', ${capacity})" class="btn-action btn-success">+ Tomar Turno</button>
      `;
      container.appendChild(card);
    });
  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar espacios.</p>'; }
}

async function attemptCancel(shiftId, dateStr, timeStr, locationName) {
  const startTime = timeStr.split('-')[0]; 
  const shiftDateTime = new Date(`${dateStr}T${startTime}:00`);
  const now = new Date();
  if (((shiftDateTime - now) / (1000 * 60 * 60)) < 24) {
      alert("⚠️ No puedes cancelar con menos de 24 horas. Comunícate directamente con los hermanos de la PPAM."); return;
  }
  if(!confirm("¿Deseas cancelar este turno?")) return;
  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];
    currentParticipants = currentParticipants.filter(id => id !== currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });
    await db.collection('notifications').add({
       type: 'cancel', shiftId: shiftId, publisherId: currentUserPublisherId, publisherName: publisherCache[currentUserPublisherId],
       message: `Canceló su turno el ${dateStr} a las ${timeStr} en ${locationName}`, timestamp: new Date(), relatedUsers: currentParticipants 
    });
    alert("Turno cancelado.");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { alert("Error al cancelar: " + err.message); }
}

async function claimShift(shiftId, dateStr, timeStr, capacity) {
  const [newStart, newEnd] = timeStr.split('-');
  for (let s of myCurrentShifts) {
    if (s.date === dateStr) {
      const [myStart, myEnd] = s.time.split('-');
      if (newStart < myEnd && myStart < newEnd) { alert(`⚠️ Se superpone con un turno que ya tienes.`); return; }
    }
  }
  if(!confirm("¿Deseas anotarte en este turno?")) return;
  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];
    if (currentParticipants.length >= capacity) { alert("Alguien más acaba de tomar este lugar."); loadAvailableShifts(); return; }
    currentParticipants.push(currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });
    alert("¡Turno agregado!");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { alert("Error al tomar turno: " + err.message); }
}

// ==========================================
// TAB 4 & 5: PERFIL Y RUTINA
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
    if (!hasShifts) container.innerHTML = '<p style="text-align:center;">No hay ubicaciones.</p>';
  } catch (error) {}
}

async function saveAvailability() {
  if (!currentUserPublisherId) return;
  const msgP = document.getElementById('avail-msg'); msgP.innerText = 'Guardando...'; msgP.style.color = '#5d7aa9';
  const selected = Array.from(document.querySelectorAll('.avail-checkbox:checked')).map(cb => cb.value);
  try {
    await db.collection('publishers').doc(currentUserPublisherId).update({ availability: selected });
    msgP.innerText = '¡Guardado!'; msgP.style.color = 'green'; setTimeout(() => msgP.innerText = '', 3000);
  } catch (error) { msgP.innerText = 'Error al guardar.'; msgP.style.color = 'red'; }
}

// FIX 2: Connect the Partner Checkbox
function handlePartnerChange() {
    const val = document.getElementById('prof-partner').value;
    document.getElementById('prof-hardpair-container').style.display = val ? 'flex' : 'none';
    if(!val) document.getElementById('prof-hardpair').checked = false;
    checkProfileChanges();
}

async function loadProfileForm() {
  if (!currentUserPublisherId) return;
  try {
    const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
    const pub = pubDoc.data();
    
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

    // FIX 1: Safely convert MaxShifts to a string so it matches the dropdown value exactly!
    originalProfileData = {
      phone: pub.phone || '', 
      email: pub.notificationEmail || '', 
      eName: pub.emergencyName || '',
      ePhone: pub.emergencyPhone || '', 
      max: (pub.maxShifts || '5').toString(), 
      partner: pub.partner || '', 
      hard: pub.hardPair || false
    };

    // Ensure button is disabled on fresh load
    document.getElementById('btn-save-profile').disabled = true;
    document.getElementById('btn-save-profile').style.background = '#ccc';
    document.getElementById('btn-save-profile').style.cursor = 'not-allowed';

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
      hard: document.getElementById('prof-hardpair').checked
    };
    
    const hasChanged = JSON.stringify(currentData) !== JSON.stringify(originalProfileData);
    const btn = document.getElementById('btn-save-profile');
    
    if (hasChanged) {
        btn.disabled = false; btn.style.background = '#28a745'; btn.style.cursor = 'pointer';
    } else {
        btn.disabled = true; btn.style.background = '#ccc'; btn.style.cursor = 'not-allowed';
    }
}

async function saveProfile() {
  if (!currentUserPublisherId) return;
  
  const emailVal = document.getElementById('prof-email').value.trim();
  if (emailVal) {
      if (!emailVal.includes('@') || !emailVal.includes('.')) { alert("Por favor, ingresa un correo válido."); return; }
      if (emailVal.toLowerCase().endsWith('@jwpub.org')) { alert("Por motivos de seguridad, no se permiten correos @jwpub.org. Usa un correo personal."); return; }
  }

  const msgP = document.getElementById('prof-msg');
  msgP.innerText = 'Guardando...'; msgP.style.color = '#5d7aa9';

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
    hardPair: document.getElementById('prof-hardpair').checked
  };

  try {
    await db.collection('publishers').doc(currentUserPublisherId).update(profileData);
    
    originalProfileData = {
        phone: profileData.phone, email: profileData.notificationEmail, eName: profileData.emergencyName,
        ePhone: profileData.emergencyPhone, max: profileData.maxShifts.toString(), partner: profileData.partner, hard: profileData.hardPair
    };
    checkProfileChanges();

    msgP.innerText = '¡Perfil actualizado con éxito!'; msgP.style.color = 'green';
    setTimeout(() => { msgP.innerText = ''; }, 3000);
  } catch (error) { 
    msgP.innerText = 'Error al guardar.'; msgP.style.color = 'red'; 
  }
}
