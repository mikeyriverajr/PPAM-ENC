// app-beta.js - Complete File

// 1. Your Real Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let publisherCache = {}; 
let currentUserPublisherId = null;

// 2. Authentication Gatekeeper
auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists && userDoc.data().publisherId) {
        currentUserPublisherId = userDoc.data().publisherId;
        
        // PRE-LOAD CACHE: Build the name dictionary once so all tabs can use it instantly
        const pubSnapshot = await db.collection('publishers').get();
        pubSnapshot.forEach(doc => {
          const data = doc.data();
          publisherCache[doc.id] = `${data.firstName || ''} ${data.lastName || ''}`.trim();
        });

        // Load the features
        loadShifts(); 
        loadMyShifts(); // <--- NEW TAB LOADED HERE
        loadAvailabilityForm();
      } else {
        console.warn("User logged in, but has no linked publisherId.");
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
    
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
// TAB 1: TODOS LOS TURNOS
// ==========================================
async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center; padding:20px;">Cargando programa...</p>';

  try {
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    if (shiftsSnapshot.empty) {
      container.innerHTML = '<p style="text-align:center;">No hay turnos programados.</p>';
      return;
    }

    container.innerHTML = '';
    shiftsSnapshot.forEach(doc => {
      const shift = doc.data();
      const participantNames = (shift.participants || []).map(id => publisherCache[id] || 'Publicador');

      const shiftCard = document.createElement('div');
      shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);";
      shiftCard.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #5d7aa9; border-bottom: 1px solid #eee; padding-bottom: 8px;">
          📅 ${shift.date} | ⏰ ${shift.time}
        </h3>
        <p style="margin: 8px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
        <p style="margin: 8px 0;"><strong>👥 Publicadores:</strong> ${participantNames.join(', ')}</p>
      `;
      container.appendChild(shiftCard);
    });
  } catch (error) {
    container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el programa.</p>';
  }
}

// ==========================================
// TAB 2: MIS TURNOS (NEW LOGIC)
// ==========================================
async function loadMyShifts() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('tab-mine');
  container.innerHTML = '<p style="text-align:center; padding:20px;">Buscando tus turnos...</p>';

  try {
    // Firebase Magic: 'array-contains' instantly finds shifts where you are in the participants array
    const shiftsSnapshot = await db.collection('shifts')
                                   .where('participants', 'array-contains', currentUserPublisherId)
                                   .get();

    if (shiftsSnapshot.empty) {
      container.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="color: #666;">Sin turnos asignados</h3>
          <p style="color: #888;">No tienes turnos programados para este mes. Revisa tu disponibilidad para el próximo mes.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '<h3 style="margin-top:0; color:#333; margin-bottom: 15px;">Tus Próximos Turnos</h3>';

    // Sort in memory chronologically
    let myShifts = [];
    shiftsSnapshot.forEach(doc => myShifts.push(doc.data()));
    myShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

    myShifts.forEach(shift => {
      const participantNames = (shift.participants || []).map(id => publisherCache[id] || 'Publicador');

      const shiftCard = document.createElement('div');
      // Adding a nice green border-left to make their personal shifts feel distinct
      shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; border-left: 5px solid #28a745; box-shadow:0 1px 3px rgba(0,0,0,0.1);";
      shiftCard.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #28a745;">📅 ${shift.date} | ⏰ ${shift.time}</h4>
        <p style="margin: 5px 0;"><strong>📍 Lugar:</strong> ${shift.location}</p>
        <p style="margin: 5px 0;"><strong>👥 Con:</strong> ${participantNames.join(', ')}</p>
      `;
      container.appendChild(shiftCard);
    });

  } catch (error) {
    console.error("Error cargando mis turnos:", error);
    container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar tus turnos.</p>';
  }
}

// ==========================================
// TAB 3: MI DISPONIBILIDAD
// ==========================================
async function loadAvailabilityForm() {
  if (!currentUserPublisherId) return;
  const container = document.getElementById('availability-form-container');
  
  try {
    const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
    const myAvailability = pubDoc.data().availability || []; 

    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const groupedShifts = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

    locSnapshot.forEach(doc => {
      const loc = doc.data();
      (loc.templates || []).forEach(t => {
        if (groupedShifts[t.day] !== undefined) {
          const valueString = `${loc.name}_${t.day}_${t.startTime}`;
          groupedShifts[t.day].push({ locationName: loc.name, timeLabel: `${t.startTime} - ${t.endTime}`, value: valueString, isChecked: myAvailability.includes(valueString) });
        }
      });
    });

    container.innerHTML = '';
    let hasShifts = false;

    daysOrder.forEach(day => {
      const shiftsForDay = groupedShifts[day];
      if (shiftsForDay.length > 0) {
        hasShifts = true;
        shiftsForDay.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));

        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-group';
        let shiftsHtml = `<h4 class="day-title">${day}</h4>`;
        
        shiftsForDay.forEach(shift => {
          const checkedAttr = shift.isChecked ? 'checked' : '';
          shiftsHtml += `
            <div class="shift-option">
              <input type="checkbox" id="chk-${shift.value}" class="avail-checkbox" value="${shift.value}" ${checkedAttr}>
              <label for="chk-${shift.value}"><strong>${shift.locationName}</strong> (${shift.timeLabel})</label>
            </div>
          `;
        });
        dayDiv.innerHTML = shiftsHtml;
        container.appendChild(dayDiv);
      }
    });

    if (!hasShifts) container.innerHTML = '<p style="text-align:center; color:#666;">No hay ubicaciones configuradas.</p>';

  } catch (error) { container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar tus opciones.</p>'; }
}

async function saveAvailability() {
  if (!currentUserPublisherId) return;
  const msgP = document.getElementById('avail-msg');
  msgP.innerText = 'Guardando...'; msgP.style.color = '#5d7aa9';

  const checkboxes = document.querySelectorAll('.avail-checkbox:checked');
  const selectedAvailability = Array.from(checkboxes).map(cb => cb.value);

  try {
    await db.collection('publishers').doc(currentUserPublisherId).update({ availability: selectedAvailability });
    msgP.innerText = '¡Disponibilidad guardada con éxito!'; msgP.style.color = 'green';
    setTimeout(() => { msgP.innerText = ''; }, 3000);
  } catch (error) { msgP.innerText = 'Error al guardar.'; msgP.style.color = 'red'; }
}
