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

auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists && userDoc.data().publisherId) {
        currentUserPublisherId = userDoc.data().publisherId;
        
        const pubSnap = await db.collection('publishers').get();
        pubSnap.forEach(d => { publisherCache[d.id] = `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim(); });
        
        loadShifts(); 
        loadMyShifts(); 
        loadAvailableShifts();
        loadAvailabilityForm();
      }
    } catch (error) { console.error("Error:", error); }
  } else {
    document.getElementById('login-overlay').style.display = 'block';
    document.getElementById('app-content').style.display = 'none';
    currentUserPublisherId = null;
  }
});

function handleGatekeeperLogin() {
  const email = document.getElementById('gate-username').value; 
  const pass = document.getElementById('gate-password').value;
  const errorDiv = document.getElementById('gate-error');
  errorDiv.innerText = "";
  auth.signInWithEmailAndPassword(email, pass).catch(err => { errorDiv.innerText = "Error: " + err.message; });
}

function logout() { auth.signOut(); }

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-btn-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

// ==========================================
// TAB 1: TODOS LOS TURNOS & SEARCH
// ==========================================
let allShiftsData = []; 

async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center;">Cargando programa...</p>';
  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    container.innerHTML = '';
    allShiftsData = [];
    
    shiftsSnapshot.forEach(doc => {
      let shift = doc.data();
      shift.id = doc.id;
      allShiftsData.push(shift);
    });
    
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
      <h3 style="margin: 0 0 8px 0; color: #5d7aa9; border-bottom: 1px solid #eee; padding-bottom: 8px;">
        📅 ${shift.date} | ⏰ ${shift.time}
      </h3>
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
      return s.location.toLowerCase().includes(query) || s.date.includes(query) || names.includes(query);
  });
  renderAllShifts(filtered);
}

// ==========================================
// TAB 2: MIS TURNOS & CANCELLATION LOGIC
// ==========================================
let myCurrentShifts = []; 

async function loadMyShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('tab-mine');
  container.innerHTML = '<p style="text-align:center;">Buscando tus turnos...</p>';

  try {
    const shiftsSnapshot = await db.collection('shifts').where('participants', 'array-contains', currentUserPublisherId).get();
    if (shiftsSnapshot.empty) {
      container.innerHTML = `<div style="background:white; padding:20px; text-align:center; border-radius:8px;"><h3 style="color:#666;">Sin turnos asignados</h3></div>`;
      myCurrentShifts = [];
      return;
    }

    container.innerHTML = '<h3 style="margin-top:0; color:#333; margin-bottom: 15px;">Tus Próximos Turnos</h3>';
    myCurrentShifts = [];
    shiftsSnapshot.forEach(doc => { let s = doc.data(); s.id = doc.id; myCurrentShifts.push(s); });
    myCurrentShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

    myCurrentShifts.forEach(shift => {
      const others = (shift.participants || []).filter(id => id !== currentUserPublisherId).map(id => publisherCache[id] || 'Desconocido');
      const partnerText = others.length > 0 ? others.join(', ') : 'Solo/a';
      
      const shiftCard = document.createElement('div');
      shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 5px solid #28a745; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;";
      shiftCard.innerHTML = `
        <div>
          <h4 style="margin: 0 0 8px 0; color: #28a745;">📅 ${shift.date} | ⏰ ${shift.time}</h4>
          <p style="margin: 5px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
          <p style="margin: 5px 0;"><strong>👥 Con:</strong> ${partnerText}</p>
        </div>
        <button onclick="attemptCancel('${shift.id}', '${shift.date}', '${shift.time}', '${shift.location}')" class="btn-action btn-danger">Cancelar</button>
      `;
      container.appendChild(shiftCard);
    });
  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar.</p>'; }
}

async function attemptCancel(shiftId, dateStr, timeStr, locationName) {
  const startTime = timeStr.split('-')[0]; 
  const shiftDateTime = new Date(`${dateStr}T${startTime}:00`);
  const now = new Date();
  const diffHours = (shiftDateTime - now) / (1000 * 60 * 60);

  if (diffHours < 24) {
      alert("⚠️ No puedes cancelar un turno con menos de 24 horas de anticipación a través de la aplicación. Por favor, comunícate directamente con los hermanos responsables de la PPAM.");
      return;
  }

  if(!confirm("¿Estás seguro de que deseas cancelar este turno? Tu espacio quedará disponible para otro publicador.")) return;

  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];
    
    currentParticipants = currentParticipants.filter(id => id !== currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });

    await db.collection('notifications').add({
       type: 'cancel', shiftId: shiftId, publisherId: currentUserPublisherId,
       publisherName: publisherCache[currentUserPublisherId],
       message: `Canceló su turno el ${dateStr} a las ${timeStr} en ${locationName}`,
       timestamp: new Date(), relatedUsers: currentParticipants 
    });

    alert("Turno cancelado. Los administradores han sido notificados.");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { alert("Error al cancelar: " + err.message); }
}

// ==========================================
// TAB 3: TURNOS DISPONIBLES (CLAIM LOGIC)
// ==========================================
async function loadAvailableShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('open-shifts-container');
  container.innerHTML = '<p style="text-align:center;">Buscando espacios libres...</p>';

  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    let openShifts = [];

    shiftsSnapshot.forEach(doc => {
      let shift = doc.data(); shift.id = doc.id;
      const capacity = shift.capacity || 2; // <--- THE FIX! NO MORE CACHE.
      const participants = shift.participants || [];
      
      if (participants.length < capacity) {
        if (!participants.includes(currentUserPublisherId)) {
           openShifts.push(shift);
        }
      }
    });

    if (openShifts.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:#666;">No hay espacios libres en este momento.</p>';
      return;
    }

    container.innerHTML = '';
    openShifts.forEach(shift => {
      const names = (shift.participants || []).map(id => publisherCache[id] || 'Alguien').join(', ') || 'Vacío';
      const capacity = shift.capacity || 2;
      const availableSpots = capacity - (shift.participants || []).length;

      const card = document.createElement('div');
      card.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 5px solid #17a2b8; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;";
      card.innerHTML = `
        <div>
          <h4 style="margin: 0 0 8px 0; color: #17a2b8;">📅 ${shift.date} | ⏰ ${shift.time}</h4>
          <p style="margin: 5px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
          <p style="margin: 5px 0; font-size:0.9em;"><strong>👥 Actuales:</strong> ${names}</p>
          <p style="margin: 5px 0; font-size:0.8em; color:#666;">Lugares libres: ${availableSpots}</p>
        </div>
        <button onclick="claimShift('${shift.id}', '${shift.date}', '${shift.time}', ${capacity})" class="btn-action btn-success">+ Tomar Turno</button>
      `;
      container.appendChild(card);
    });

  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar espacios.</p>'; }
}

async function claimShift(shiftId, dateStr, timeStr, capacity) {
  const [newStart, newEnd] = timeStr.split('-');
  
  for (let s of myCurrentShifts) {
    if (s.date === dateStr) {
      const [myStart, myEnd] = s.time.split('-');
      if (newStart < myEnd && myStart < newEnd) {
          alert(`⚠️ No puedes tomar este turno porque se superpone con un turno que ya tienes a las ${s.time} en ${s.location}.`);
          return;
      }
    }
  }

  if(!confirm("¿Deseas anotarte en este turno?")) return;

  try {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const docSnap = await shiftRef.get();
    let currentParticipants = docSnap.data().participants || [];

    if (currentParticipants.length >= capacity) {
       alert("Lo sentimos, alguien más acaba de tomar el último lugar en este turno.");
       loadAvailableShifts(); return;
    }

    currentParticipants.push(currentUserPublisherId);
    await shiftRef.update({ participants: currentParticipants });

    alert("¡Turno agregado a tu programa!");
    loadMyShifts(); loadAvailableShifts(); loadShifts(); 
  } catch (err) { alert("Error al tomar turno: " + err.message); }
}

// ==========================================
// TAB 4: MI DISPONIBILIDAD
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
        hasShifts = true;
        grouped[day].sort((a, b) => a.time.localeCompare(b.time));
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
