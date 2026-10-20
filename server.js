const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.get('/firebase-config.js', (req, res) => {
  const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ';
  res.type('application/javascript').send(`// Firebase configuration for PPAM-Beta
const firebaseConfig = {
  apiKey: ${JSON.stringify(apiKey)},
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};
`);
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
