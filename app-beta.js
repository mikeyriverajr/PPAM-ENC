// app-beta.js - Complete File

// 1. Paste your real Firebase Config here
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

// 2. Authentication Gatekeeper
auth.onAuthStateChanged(user => {
  if (user) {
    // User is logged in! Hide the login screen, show the app.
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    
    // FETCH THE DATA!
    loadShifts(); 
  } else {
    // Not logged in. Show the login screen.
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
  }
});

// 3. Login Function (Tied to the button in beta.html)
function handleGatekeeperLogin() {
  const email = document.getElementById('gate-username').value; 
  const pass = document.getElementById('gate-password').value;
  const errorDiv = document.getElementById('gate-error');
  
  errorDiv.innerText = ""; // Clear old errors
  
  auth.signInWithEmailAndPassword(email, pass)
    .catch(error => {
      errorDiv.innerText = "Error: " + error.message;
    });
}

// 4. Logout Function
function logout() {
  auth.signOut();
}

// --- APP LOGIC ---

// A dictionary to store our Publisher IDs and their real names
let publisherCache = {}; 

async function loadShifts() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p style="text-align:center; padding:20px;">Cargando programa...</p>';

  try {
    // 1. Fetch the Master List of Publishers
    const pubSnapshot = await db.collection('publishers').get();
    pubSnapshot.forEach(doc => {
      const data = doc.data();
      
      // BULLETPROOF NAME CHECK: 
      // Checks for 'name' OR 'firstName' + 'lastName'
      let fullName = "Nombre no definido";
      if (data.name) {
          fullName = data.name;
      } else if (data.firstName || data.lastName) {
          fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
      }
      
      // Store it in our dictionary
      publisherCache[doc.id] = fullName; 
    });

    // 2. Fetch the Shifts (Ordered by date)
    const shiftsSnapshot = await db.collection('shifts').orderBy('date').get();
    
    if (shiftsSnapshot.empty) {
      container.innerHTML = '<p style="text-align:center;">No hay turnos programados.</p>';
      return;
    }

    container.innerHTML = ''; // Clear the loading text

    // 3. Draw each shift on the screen
    shiftsSnapshot.forEach(doc => {
      const shift = doc.data();
      
      const participantsArray = shift.participants || [];
      const participantNames = participantsArray.map(id => {
         return publisherCache[id] || 'Publicador Desconocido';
      });

      // Build the HTML card for the shift
      const shiftCard = document.createElement('div');
      shiftCard.style.backgroundColor = "white";
      shiftCard.style.padding = "15px";
      shiftCard.style.marginBottom = "15px";
      shiftCard.style.borderRadius = "8px";
      shiftCard.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";

      shiftCard.innerHTML = `
        <h3 style="margin-top: 0; color: #5d7aa9; border-bottom: 1px solid #eee; padding-bottom: 8px;">
          📅 ${shift.date || 'Fecha sin definir'} | ⏰ ${shift.time || 'Hora sin definir'}
        </h3>
        <p style="margin: 8px 0;"><strong>📍 Lugar:</strong> ${shift.location || 'Lugar sin definir'}</p>
        <p style="margin: 8px 0;"><strong>👥 Publicadores:</strong> ${participantNames.join(', ')}</p>
      `;
      
      container.appendChild(shiftCard);
    });

  } catch (error) {
    console.error("Error cargando turnos:", error);
    container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el programa. Revisa la consola.</p>';
  }
}

// 5. Tab Switching Function (Since it's referenced in your HTML)
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
}
