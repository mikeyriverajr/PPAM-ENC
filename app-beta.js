// app-beta.js - Foundation

// 1. Paste your Firebase Config here (You get this from Project Settings in Firebase)
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
    
    console.log("Logged in successfully. UID:", user.uid);
    
    // We will call our loadShifts() function right here in the next step!
  } else {
    // Not logged in. Show the login screen.
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
  }
});

// 3. Login Function (Tied to the button in beta.html)
function handleGatekeeperLogin() {
  // Note: Firebase Auth uses emails, so the "Usuario" field should be an email address
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
