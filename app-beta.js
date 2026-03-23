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
let currentUserPublisherId = null; // Stores the logged-in user's true Publisher ID

// 2. Authentication Gatekeeper
auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    
    // FETCH THE USER'S PUBLISHER LINK
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists && userDoc.data().publisherId) {
        currentUserPublisherId = userDoc.data().publisherId;
        
        // Load the features now that we know who they are
        loadShifts(); 
        loadAvailabilityForm();
      } else {
        console.warn("User logged in, but has no linked publisherId in the database.");
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

// 3. Login/Logout Functions
function handleGatekeeperLogin() {
  const email = document.getElementById('gate-username').value; 
  const pass = document.getElementById('gate-password').value;
  const errorDiv = document.getElementById('gate-error');
  
  errorDiv.innerText = "";
  auth.signInWithEmailAndPassword(email, pass)
    .catch(error => { errorDiv.innerText = "Error: " + error.message; });
}

function logout() { auth.signOut(); }

// 4. Tab Switching Logic
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.getElementById('tab-btn-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

// ==========================================
// TAB 1: TODOS LOS TURNOS (Existing Logic)
// ==========================================
async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center; padding:20px;">Cargando programa...</p>';

  try {
    const pubSnapshot = await db.collection('publishers').get();
    pubSnapshot.forEach(doc => {
      const data = doc.data();
      let fullName = "Nombre no definido";
      if (data.name) {
          fullName = data.name;
      } else if (data.firstName || data.lastName) {
          fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
      }
      publisherCache[doc.id] = fullName; 
    });

    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    if (shiftsSnapshot.empty) {
      container.innerHTML = '<p style="text-align:center;">No hay turnos programados.</p>';
      return;
    }

    container.innerHTML = '';
    shiftsSnapshot.forEach(doc => {
      const shift = doc.data();
      const participantsArray = shift.participants || [];
      const participantNames = participantsArray.map(id => publisherCache[id] || 'Publicador Desconocido');

      const shiftCard = document.createElement('div');
      shiftCard.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);";
      shiftCard.innerHTML = `
        <h3 style="margin-top: 0; color: #5d7aa9; border-bottom: 1px solid #eee; padding-bottom: 8px;">
          📅 ${shift.date || 'Sin definir'} | ⏰ ${shift.time || 'Sin definir'}
        </h3>
        <p style="margin: 8px 0;"><strong>📍 Lugar:</strong> ${shift.location || 'Sin definir'}</p>
        <p style="margin: 8px 0;"><strong>👥 Publicadores:</strong> ${participantNames.join(', ')}</p>
      `;
      container.appendChild(shiftCard);
    });
  } catch (error) {
    console.error("Error cargando turnos:", error);
    container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el programa.</p>';
  }
}

// ==========================================
// TAB 3: MI DISPONIBILIDAD (NEW LOGIC)
// ==========================================
async function loadAvailabilityForm() {
  if (!currentUserPublisherId) return;

  const container = document.getElementById('availability-form-container');
  
  try {
    // 1. Fetch the Publisher's currently saved availability
    const pubDoc = await db.collection('publishers').doc(currentUserPublisherId).get();
    const myAvailability = pubDoc.data().availability || []; // Array of saved string templates

    // 2. Fetch all active locations and their templates
    const locSnapshot = await db.collection('locations').where('isActive', '==', true).get();
    
    // Structure to group shifts by Day of the Week
    const daysOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const groupedShifts = {
      'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 
      'Viernes': [], 'Sábado': [], 'Domingo': []
    };

    locSnapshot.forEach(doc => {
      const loc = doc.data();
      const locName = loc.name;
      
      (loc.templates || []).forEach(t => {
        if (groupedShifts[t.day] !== undefined) {
          // Create a unique standard string (e.g., "Estacionamiento Liberty_Martes_08:00")
          const valueString = `${locName}_${t.day}_${t.startTime}`;
          
          groupedShifts[t.day].push({
            locationName: locName,
            timeLabel: `${t.startTime} - ${t.endTime}`,
            value: valueString,
            isChecked: myAvailability.includes(valueString)
          });
        }
      });
    });

    // 3. Render the UI
    container.innerHTML = '';
    let hasShifts = false;

    daysOrder.forEach(day => {
      const shiftsForDay = groupedShifts[day];
      
      if (shiftsForDay.length > 0) {
        hasShifts = true;
        
        // Sort shifts by start time
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

    if (!hasShifts) {
      container.innerHTML = '<p style="text-align:center; color:#666;">No hay ubicaciones configuradas en el sistema todavía.</p>';
    }

  } catch (error) {
    console.error("Error loading availability:", error);
    container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar tus opciones.</p>';
  }
}

async function saveAvailability() {
  if (!currentUserPublisherId) return;

  const msgP = document.getElementById('avail-msg');
  msgP.innerText = 'Guardando...';
  msgP.style.color = '#5d7aa9';

  // Gather all checked boxes
  const checkboxes = document.querySelectorAll('.avail-checkbox:checked');
  const selectedAvailability = Array.from(checkboxes).map(cb => cb.value);

  try {
    // Update the publisher's document
    await db.collection('publishers').doc(currentUserPublisherId).update({
      availability: selectedAvailability
    });
    
    msgP.innerText = '¡Disponibilidad guardada con éxito!';
    msgP.style.color = 'green';
    
    // Clear message after 3 seconds
    setTimeout(() => { msgP.innerText = ''; }, 3000);
    
  } catch (error) {
    console.error("Error saving availability:", error);
    msgP.innerText = 'Error al guardar. Intenta de nuevo.';
    msgP.style.color = 'red';
  }
}
