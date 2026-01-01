// Global variables
const SHEET_ID = '1SuiFgX2XiBeVec6bCeJFRhXPuTUEdYe7IIa105NI8jY';
// API_KEY is no longer needed for public CSV access
const ADMIN_PHONE = '595983281197';

// Firebase Configuration
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
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();
} else {
  console.error("Firebase SDK not loaded.");
}

// Current User State
let currentUser = null;
let linkedName = null;

// Year logic will be handled inside parseSpanishDate

// Will hold the final structured data
let scheduleData = [];
let savedNames = [];
let currentView = 'all'; // 'all', 'mine', or 'available'

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(() => console.log('Service Worker Registered'))
    .catch((err) => console.error('Service Worker Failed', err));
}

document.addEventListener("DOMContentLoaded", function () {

  // Auth State Listener
  if (auth) {
    auth.onAuthStateChanged((user) => {
      currentUser = user;
      updateAuthUI();
      if (user) {
        // Fetch user profile to see if they have a linked name
        db.collection("users").doc(user.uid).get().then(doc => {
          if (doc.exists && doc.data().linkedName) {
            linkedName = doc.data().linkedName;
            savedNames = [linkedName]; // Override local favorites with cloud identity
            updateAuthUI(); // Update display name
            renderSchedule();
          }
        });
      }
    });
  }

  loadFavorites();

  if (savedNames.length > 0) {
    currentView = 'mine';
  } else {
    currentView = 'all';
  }

  switchTab(currentView);

  initFirestoreListener();
});

// --- Migration Tool (Temporary) ---

function fetchOriginalDataForMigration() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Programa`;
  console.log("Fetching original CSV data for migration...");

  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.text();
    })
    .then(csvText => {
      const rows = parseCSV(csvText);
      // We parse it into the global scheduleData variable so migrateData can use it
      scheduleData = parseData(rows);
      console.log("Original data loaded. Ready to migrate.");
      return true;
    })
    .catch(error => {
      console.error("Error fetching original data:", error);
      alert("Error al obtener datos de Google Sheets. Revisa la consola.");
      return false;
    });
}

async function migrateData() {
  if (!confirm("Esto sobrescribirá la base de datos con los datos actuales de la hoja de cálculo. ¿Estás seguro?")) return;

  // 1. Fetch data first
  const success = await fetchOriginalDataForMigration();
  if (!success) return;

  console.log("Starting Migration...");
  const batch = db.batch();
  let count = 0;

  // 1. Extract all unique names for "participants"
  const allNames = new Set();

  scheduleData.forEach(day => {
    // Save Day
    const dayRef = db.collection("days").doc(day.date);
    batch.set(dayRef, {
      date: day.date,
      dayLabel: day.dayLabel
    });

    // Save Managers
    day.managers.forEach(mgr => {
       allNames.add(mgr.name);
       // We could store managers in a subcollection or array on the day
       // For simplicity, let's keep them in the day doc for now
    });
    // Update day with managers array
    batch.update(dayRef, {
        managers: day.managers
    });

    // Save Slots
    day.slots.forEach(slot => {
       const slotId = day.date + "_" + slot.loc.replace(/[^a-zA-Z0-9]/g, '') + "_" + slot.time.replace(/[^a-zA-Z0-9]/g, '');
       const slotRef = db.collection("shifts").doc(slotId);

       // Fix: Keep "Disponible" placeholders to preserve slot capacity logic
       batch.set(slotRef, {
         date: day.date,
         location: slot.loc,
         time: slot.time,
         participants: slot.names,
         status: slot.names.some(n => n.toLowerCase().includes("disponible")) ? "open" : "full"
       });

       count++;

       slot.names.forEach(n => {
         if(!n.toLowerCase().includes("disponible")) allNames.add(n);
       });
    });
  });

  // Save Unique Names to a collection for the "Claim" dropdown
  allNames.forEach(name => {
      const ref = db.collection("participants").doc(name);
      batch.set(ref, { name: name }, { merge: true });
  });

  await batch.commit();
  console.log(`Migration Complete. ${count} shifts and ${allNames.size} participants migrated.`);
  alert("Migración Completa");
}

// Make it available globally for manual trigger in console
window.migrateData = migrateData;

// --- Auth Functions ---

function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'block';
  document.getElementById('auth-error').innerText = '';
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function handleAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const pass = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');

  if (!username || !pass) {
    errorEl.innerText = "Por favor completa todos los campos.";
    return;
  }

  // Email Strategy: Check if it looks like an email, otherwise make it a dummy one
  let email = username;
  if (!username.includes('@')) {
    email = username + "@ppam.placeholder.com";
  }

  auth.signInWithEmailAndPassword(email, pass)
    .then(() => {
      closeAuthModal();
    })
    .catch((error) => {
      errorEl.innerText = "Error: " + error.message;
    });
}

function updateAuthUI() {
  const nameEl = document.getElementById('user-display-name');
  const overlay = document.getElementById('login-overlay');
  const appContent = document.getElementById('app-content');

  if (currentUser) {
    nameEl.innerText = linkedName || currentUser.email.split('@')[0];
    overlay.style.display = 'none';
    appContent.style.display = 'block';
  } else {
    nameEl.innerText = "Invitado";
    overlay.style.display = 'flex';
    appContent.style.display = 'none';
  }
}

function handleGatekeeperLogin() {
    const user = document.getElementById('gate-username').value.trim();
    const pass = document.getElementById('gate-password').value;
    const err = document.getElementById('gate-error');

    if (!user || !pass) {
        err.innerText = "Ingresa usuario y contraseña.";
        return;
    }

    let email = user;
    if (!user.includes('@')) {
        email = user + "@ppam.placeholder.com";
    }

    auth.signInWithEmailAndPassword(email, pass)
        .catch(error => {
            err.innerText = "Credenciales incorrectas.";
            console.error(error);
        });
}

function logout() {
    auth.signOut().then(() => {
        linkedName = null;
        savedNames = [];
        window.location.reload();
    });
}

function loadFavorites() {
  const stored = localStorage.getItem('ppam_favorites');
  if (stored) {
    try {
      savedNames = JSON.parse(stored);
    } catch (e) {
      console.error("Error loading favorites", e);
      savedNames = [];
    }
  }
}

function saveFavorites() {
  localStorage.setItem('ppam_favorites', JSON.stringify(savedNames));
}

function toggleFavorite(name) {
  if (savedNames.includes(name)) {
    savedNames = savedNames.filter(n => n !== name);
  } else {
    savedNames.push(name);
  }
  saveFavorites();
  renderSchedule();
  applyDateFilter(); // Ensure dates are filtered again
}

function switchTab(tab) {
  currentView = tab;

  // Update Tab UI
  document.getElementById('tab-all').className = tab === 'all' ? 'tab active' : 'tab';
  document.getElementById('tab-mine').className = tab === 'mine' ? 'tab active' : 'tab';
  document.getElementById('tab-available').className = tab === 'available' ? 'tab active' : 'tab';
  document.getElementById('tab-availability-input').className = tab === 'availability-input' ? 'tab active' : 'tab';

  // Toggle Search & Instructions visibility
  const searchContainer = document.getElementById('search-container');
  const allInstructions = document.getElementById('all-view-instructions');
  const availInstructions = document.getElementById('availability-instructions');
  const scheduleContainer = document.getElementById('schedule-container');
  const availabilityContainer = document.getElementById('availability-container');

  // Defaults
  searchContainer.style.display = 'none';
  allInstructions.style.display = 'none';
  availInstructions.style.display = 'none';
  scheduleContainer.style.display = 'none';
  availabilityContainer.style.display = 'none';

  if (tab === 'all') {
    searchContainer.style.display = 'flex';
    allInstructions.style.display = 'block';
    scheduleContainer.style.display = 'block';
    renderSchedule();
    applyDateFilter();
  } else if (tab === 'mine' || tab === 'available') {
    scheduleContainer.style.display = 'block';
    renderSchedule();
    applyDateFilter();
  } else if (tab === 'availability-input') {
    availInstructions.style.display = 'block';
    availabilityContainer.style.display = 'block';
    renderAvailabilityInput();
  }
}

async function renderAvailabilityInput() {
  const container = document.getElementById('availability-container');
  container.innerHTML = "Cargando formulario...";

  if (!currentUser) {
    container.innerHTML = "<p style='text-align:center; padding:20px;'>Debes iniciar sesión para indicar tu disponibilidad.</p>";
    return;
  }

  // 1. Determine Target Month (Next Month)
  // For beta purposes, let's hardcode to February 2026 since the CSV is Jan 2026.
  // In real app, this would be dynamic: new Date().getMonth() + 1
  const targetYear = 2026;
  const targetMonth = 1; // 0-indexed, so 1 is February
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const monthLabel = "Febrero 2026";
  const monthKey = "2026-02";

  // 2. Fetch Existing Availability
  let existingSlots = [];
  try {
    const doc = await db.collection("availability").doc(`${monthKey}_${currentUser.uid}`).get();
    if (doc.exists) {
      existingSlots = doc.data().slots || []; // Array of strings "YYYY-MM-DD_Time"
    }
  } catch (e) {
    console.error("Error loading availability", e);
  }

  // 3. Identify Standard Time Slots from current scheduleData
  // We collect all unique time strings found in the current schedule to populate the form
  const uniqueTimes = new Set();
  scheduleData.forEach(d => {
    d.slots.forEach(s => uniqueTimes.add(s.time));
  });
  const timeOptions = Array.from(uniqueTimes).sort();
  // If empty (no data loaded yet), provide defaults
  if (timeOptions.length === 0) {
      timeOptions.push("08:00 a 10:00", "10:00 a 12:00", "14:00 a 16:00", "16:00 a 18:00");
  }

  // 4. Build UI
  let html = `
    <div style="background:white; padding:15px; border-radius:8px; margin-bottom:20px;">
      <h3>Disponibilidad para ${monthLabel}</h3>
      <p>Marca las casillas de los horarios en los que podrías servir.</p>
    </div>
    <form id="availability-form">
  `;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(targetYear, targetMonth, d);
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
    const dayStr = d.toString().padStart(2,'0');
    const fullDate = `${targetYear}-${(targetMonth+1).toString().padStart(2,'0')}-${dayStr}`;

    // Capitalize day name
    const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);

    html += `
      <div class="day-avail-row" style="background:white; margin-bottom:10px; padding:10px; border-radius:8px;">
        <div style="font-weight:bold; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;">
           ${dayLabel} ${dayStr}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
    `;

    timeOptions.forEach(time => {
       const slotKey = `${fullDate}_${time}`;
       const isChecked = existingSlots.includes(slotKey) ? "checked" : "";

       html += `
         <label style="display:flex; align-items:center; background:#f0f4f8; padding:5px 10px; border-radius:15px; font-size:0.9em; cursor:pointer;">
           <input type="checkbox" name="avail_slot" value="${slotKey}" ${isChecked} style="margin-right:5px;">
           ${time}
         </label>
       `;
    });

    html += `</div></div>`;
  }

  html += `
    <div style="position:sticky; bottom:20px; text-align:center; padding:10px;">
      <button type="button" onclick="saveAvailability('${monthKey}')" style="background:#28a745; color:white; border:none; padding:15px 30px; border-radius:25px; font-size:1.1em; box-shadow:0 4px 10px rgba(0,0,0,0.2); cursor:pointer;">
        Guardar Disponibilidad
      </button>
    </div>
    </form>
  `;

  container.innerHTML = html;
}

function saveAvailability(monthKey) {
  if (!currentUser) return;

  const checkboxes = document.querySelectorAll('input[name="avail_slot"]:checked');
  const selectedSlots = Array.from(checkboxes).map(cb => cb.value);

  const docId = `${monthKey}_${currentUser.uid}`;
  const btn = document.querySelector('button[onclick^="saveAvailability"]');
  const originalText = btn.innerText;
  btn.innerText = "Guardando...";
  btn.disabled = true;

  db.collection("availability").doc(docId).set({
    uid: currentUser.uid,
    linkedName: linkedName || "Unknown", // Assuming linkedName is global
    month: monthKey,
    slots: selectedSlots,
    updatedAt: new Date()
  }).then(() => {
    alert("¡Disponibilidad guardada correctamente!");
    btn.innerText = originalText;
    btn.disabled = false;
  }).catch(err => {
    console.error("Error saving availability", err);
    alert("Hubo un error al guardar. Intenta de nuevo.");
    btn.innerText = originalText;
    btn.disabled = false;
  });
}

// CSV Parser Helper
function parseCSV(text) {
  const result = [];
  let row = [];
  let inQuote = false;
  let token = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          token += '"';
          i++; // skip escaped quote
        } else {
          inQuote = false;
        }
      } else {
        token += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        row.push(token);
        token = "";
      } else if (char === '\n' || char === '\r') {
        row.push(token);
        token = "";
        if (row.length > 0) result.push(row);
        row = [];
        if (char === '\r' && nextChar === '\n') i++; // skip \n
      } else {
        token += char;
      }
    }
  }
  if (token || row.length > 0) {
    row.push(token);
    result.push(row);
  }
  return result;
}

function parseData(rows) {
  // rows is an array of arrays (from CSV)

  // Helper to safely get value from row/col
  const getVal = (r, c) => {
    if (!r || !r[c]) return "";
    return r[c].trim();
  };

  // Note: CSV does not support hyperlinks, so getLink is removed.

  // Find header row index
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const val0 = getVal(rows[i], 0);
    const val1 = getVal(rows[i], 1);
    if (val0.toLowerCase().includes("fecha") && val1.toLowerCase().includes("ubicación")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Could not find header row. Assuming row 0 is header.");
    headerIndex = 0;
  }

  // Dynamic Column Mapping
  let managerColIndex = -1;
  let linkColIndex = -1;
  const slotColumns = []; // [{ index: 2, label: "8 a 10" }, ...]

  const headerRow = rows[headerIndex];
  for (let c = 0; c < headerRow.length; c++) {
      const headerVal = headerRow[c].toLowerCase().trim();

      // Reserved Columns
      if (headerVal.includes("fecha") || headerVal.includes("ubicación") || headerVal.includes("ubicacion")) {
          continue; // standard columns 0 and 1
      }

      if (headerVal.includes("encargado")) {
          managerColIndex = c;
          continue;
      }

      if (headerVal.includes("enlace") || headerVal.includes("link")) {
          linkColIndex = c;
          continue;
      }

      // If it's not a reserved column, assume it's a Time Slot
      if (headerVal.length > 0) {
          slotColumns.push({ index: c, label: headerRow[c].trim() });
      }
  }

  // Fallback if no specific manager column found (backward compatibility)
  if (managerColIndex === -1 && rows[0].length > 5) managerColIndex = 5;

  const daysMap = new Map();
  let lastDateStr = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];

    // Fill-down logic for Date
    let dateStr = getVal(row, 0);
    if (dateStr) {
      lastDateStr = dateStr;
    } else if (lastDateStr) {
      dateStr = lastDateStr;
    } else {
      continue;
    }

    const location = getVal(row, 1);
    if (!location) continue;

    const managerName = (managerColIndex !== -1) ? getVal(row, managerColIndex) : "";
    const managerLink = (linkColIndex !== -1) ? getVal(row, linkColIndex) : null;

    if (!daysMap.has(dateStr)) {
      daysMap.set(dateStr, {
        date: parseSpanishDate(dateStr),
        dayLabel: dateStr,
        managers: new Map(),
        slotsMap: new Map()
      });
    }

    const dayObj = daysMap.get(dateStr);

    if (managerName) {
      let role = "Encargado";
      if (location.toLowerCase().includes("costanera")) {
        role = "Encargado Costanera";
      } else if (location.toLowerCase().includes("liberty")) {
        role = "Encargado del día";
      }

      if (!dayObj.managers.has(managerName)) {
        dayObj.managers.set(managerName, { role: role, name: managerName, link: managerLink });
      }
    }

    const addSlot = (timeLabel, namesStr) => {
      if (!namesStr || !location) return;
      if (namesStr.toLowerCase().includes("no hay turno")) return;

      const key = location + "|" + timeLabel;
      if (!dayObj.slotsMap.has(key)) {
        dayObj.slotsMap.set(key, {
          loc: location,
          time: timeLabel,
          names: []
        });
      }

      const namesList = namesStr.split(/[\n,]+/).map(n => n.trim()).filter(n => n.length > 0);
      namesList.forEach(name => {
        if (name.toLowerCase().includes("no hay turno")) return;
        dayObj.slotsMap.get(key).names.push(name);
      });
    };

    // Dynamically process all identified slot columns
    slotColumns.forEach(col => {
        const names = getVal(row, col.index);
        addSlot(col.label, names);
    });
  }

  // Convert Map to Array
  const result = [];
  daysMap.forEach((dayObj, dateStr) => {
    const managersArray = Array.from(dayObj.managers.values());
    const slotsArray = Array.from(dayObj.slotsMap.values()).filter(s => s.names.length > 0);

    // Sort slots
    slotsArray.sort((a, b) => {
      const pad = (s) => {
        // Try to find a time pattern like "8:00", "08", "15" in the label
        const match = s.match(/(\d{1,2})[:\s]?(?:\d{2})?\s*(?:a|–|-|—)/);
        if (!match) {
            // Fallback for simple numbers at start
            const simple = s.match(/^\d{1,2}/);
            if(simple) return simple[0].padStart(5, '0');
            return s;
        }
        return match[1].padStart(5, '0');
      };
      return pad(a.time).localeCompare(pad(b.time));
    });

    result.push({
      date: dayObj.date,
      dayLabel: dayObj.dayLabel,
      managers: managersArray,
      slots: slotsArray
    });
  });

  return result;
}

function parseSpanishDate(dateStr) {
  const months = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
    "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
  };

  const lower = dateStr.toLowerCase();
  let day = "01";
  let month = "01";
  let year = 2026;

  const dayMatch = lower.match(/\d{1,2}/);
  if (dayMatch) {
    day = dayMatch[0].padStart(2, '0');
  }

  for (const [name, code] of Object.entries(months)) {
    if (lower.includes(name)) {
      month = code;
      if (name === "diciembre") {
        year = 2025;
      } else {
        year = 2026;
      }
      break;
    }
  }

  return `${year}-${month}-${day}`;
}


function renderSchedule() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = "";

  const counterEl = document.getElementById('shift-counter');
  let myShiftCount = 0;
  let hasVisibleShifts = false;

  // Calculate today string for filtering count
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${d}`;

  scheduleData.forEach(day => {
    let visibleSlots = day.slots;
    let hasAvailableInDay = false; // Flag to check if day has openings

    // Filter Logic
    if (currentView === 'mine') {
      if (savedNames.length === 0) {
         visibleSlots = [];
      } else {
         visibleSlots = day.slots.filter(slot => {
           // 1. Is this person a participant in the slot?
           const isParticipant = slot.names.some(n => savedNames.includes(n));
           if (isParticipant) return true;

           // 2. Is this person a Manager for the day?
           const starredManagers = Array.from(day.managers.values()).filter(m => savedNames.includes(m.name));
           if (starredManagers.length > 0) {
             const location = slot.loc.toLowerCase();
             return starredManagers.some(mgr => {
               const role = mgr.role.toLowerCase();
               const isCostaneraMgr = role.includes('costanera');
               const isCostaneraSlot = location.includes('costanera');
               if (isCostaneraMgr && isCostaneraSlot) return true;
               if (!isCostaneraMgr && !isCostaneraSlot) return true;
               return false;
             });
           }
           return false;
         });
      }
    } else if (currentView === 'available') {
      visibleSlots = day.slots.filter(slot => {
        // Check both 'open' status OR legacy "disponible" string check for robustness
        return slot.status === 'open' || slot.names.some(n => n.toLowerCase().includes("disponible"));
      });
    }

    // Count shifts for the user (only for future/today)
    if (currentView === 'mine' && day.date >= todayStr) {
        // Check if I am a Manager for this day
        // We use the same filtering logic: did we "match" this day because of a manager role?
        const amIManager = Array.from(day.managers.values()).some(m => savedNames.includes(m.name));

        if (amIManager) {
            // If I am a manager, count the DAY as 1 shift (regardless of how many slots)
            if (visibleSlots.length > 0) { // Only count if there are actual slots to manage
                myShiftCount++;
            }
        } else {
            // If I am just a participant, count every slot
            visibleSlots.forEach(slot => {
                myShiftCount++;
            });
        }
    }

    if ((currentView === 'mine' || currentView === 'available') && visibleSlots.length === 0) {
        return; // Don't render empty days in Mine/Available view
    }

    const dayDiv = document.createElement('div');
    dayDiv.className = 'day';
    dayDiv.setAttribute('data-date', day.date);

    let html = `<h2>${day.dayLabel}</h2>`;

    // Only show managers if NOT in "Available" view
    if (day.managers && day.managers.size > 0) {
      html += `<div class="encargado">`;
      day.managers.forEach(mgr => {
        const content = mgr.link
          ? `<a href="${mgr.link}" target="_blank">${mgr.name}</a>`
          : mgr.name;

        const isFav = savedNames.includes(mgr.name);
        const starClass = isFav ? "star-btn active" : "star-btn";
        const starIcon = isFav ? "★" : "☆";
        const safeName = mgr.name.replace(/'/g, "\\'");

        html += `<div><strong>${mgr.role}:</strong> ${content}
                 <button class="${starClass}" onclick="toggleFavorite('${safeName}')" title="${isFav ? 'Quitar de mis turnos' : 'Agregar a mis turnos'}">${starIcon}</button>
                 </div>`;
      });
      html += `</div>`;
    }

    html += `<div class="schedule">`;

    visibleSlots.forEach(slot => {
      let icon = "🕘";
      if (slot.time.includes("8:00")) icon = "🕗";
      if (slot.time.includes("10:00")) icon = "🕙";
      if (slot.time.includes("18:30")) icon = "🕡";

      let listHtml = "";
      // In Firestore mode, 'names' might not contain "Disponible". The status is what matters.
      // But for rendering lists, we iterate names.
      // If status is 'open', we should render the "Take Shift" action.

      const isFull = slot.status === 'full';

      // Render existing participants
      slot.names.forEach(n => {
        const isDisponible = n.toLowerCase().includes("disponible");
        if (isDisponible) return; // Don't list "Disponible" as a person

        const isFav = savedNames.includes(n);
        const starClass = isFav ? "star-btn active" : "star-btn";
        const starIcon = isFav ? "★" : "☆";
        const safeName = n.replace(/'/g, "\\'");

        // Check if this is ME (the logged in user)
        let actionHtml = ``;
        if (currentUser && linkedName === n) {
            // I can cancel my own shift
            actionHtml = `<button class="cancel-btn" onclick="cancelShift('${slot.id}')" title="Cancelar mi turno">Cancelar</button>`;
        } else {
            // Allow starring for others or if not logged in
            actionHtml = `<button class="${starClass}" onclick="toggleFavorite('${safeName}')" title="${isFav ? 'Quitar de mis turnos' : 'Agregar a mis turnos'}">${starIcon}</button>`;
        }

        listHtml += `<li>
          ${n}
          ${actionHtml}
        </li>`;
      });

      // Render "Take Shift" option if open
      if (!isFull) {
           if (currentUser && linkedName) {
             listHtml += `<li>
               <button class="cubrir-btn" onclick="takeShift('${slot.id}')">Tomar turno</button>
             </li>`;
           } else {
             const message = `Hola, quisiera cubrir el turno disponible del ${day.dayLabel} a las ${slot.time} en ${slot.loc}.`;
             const whatsappUrl = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(message)}`;
             listHtml += `<li>
               <a href="${whatsappUrl}" target="_blank" class="cubrir-btn">Cubrir el turno</a>
             </li>`;
           }
      }

      // Calendar Buttons (Same as before)
      const dateStr = day.date.replace(/-/g, '');
      const times = slot.time.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
      let calendarActions = "";

      if (times) {
        const start = times[1].replace(':', '').padStart(4,'0') + "00";
        const end = times[2].replace(':', '').padStart(4,'0') + "00";
        const title = `${slot.loc} – PPAM`;
        const details = `Asignados: ${slot.names.join(', ')}`;
        const locationStr = slot.loc;

        const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dateStr}T${start}/${dateStr}T${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(locationStr)}&ctz=America/Asuncion`;

        const icsContent = generateICS(title, day.date, times[1], times[2], locationStr, details);
        const icsBlob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const icsUrl = URL.createObjectURL(icsBlob);

        calendarActions = `
          <div class="calendar-actions">
            <a href="${googleUrl}" target="_blank" class="calendar-link">
              <svg class="calendar-icon" viewBox="0 0 24 24"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm14 8H3v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9z"/></svg>
              <span>Guardar en mi calendario</span>
            </a>
            <a href="${icsUrl}" download="turno-ppam.ics" class="calendar-link ics">
              <svg class="calendar-icon" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
              <span>Guardar en mi calendario (iOS)</span>
            </a>
          </div>
        `;
      }

      html += `
        <div class="slot">
          <h3>${slot.loc}</h3>
          <div class="time">${icon} ${slot.time}</div>
          <ul>${listHtml}</ul>
          ${calendarActions}
        </div>
      `;
    });

    html += `</div>`;
    dayDiv.innerHTML = html;
    container.appendChild(dayDiv);
    hasVisibleShifts = true;
  });

  if (currentView === 'mine' && !hasVisibleShifts && savedNames.length > 0) {
      container.innerHTML = "<p style='text-align:center; padding:20px;'>No se encontraron turnos para tus nombres guardados.</p>";
  }

  if (currentView === 'available' && !hasVisibleShifts) {
      container.innerHTML = "<p style='text-align:center; padding:20px;'>No hay turnos disponibles por el momento.</p>";
  }

  // Call updateCounter at the end of rendering
  updateCounter(myShiftCount);
}

function generateICS(title, date, startTime, endTime, location, description) {
  const formatTime = (t) => {
    const raw = t.replace(':', '');
    const parts = t.split(':');
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}${m}00`;
  };

  const start = date.replace(/-/g, '') + "T" + formatTime(startTime);
  const end = date.replace(/-/g, '') + "T" + formatTime(endTime);

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PPAM//Schedule//ES
BEGIN:VEVENT
UID:${Date.now()}@ppam
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART;TZID=America/Asuncion:${start}
DTEND;TZID=America/Asuncion:${end}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;
}

function applyDateFilter() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${d}`;

  document.querySelectorAll(".day").forEach(day => {
    const dateAttr = day.getAttribute('data-date');
    if (!dateAttr) return;

    if (dateAttr === todayStr) {
      day.classList.add("today");
    } else {
      day.classList.remove("today");
    }

    if (dateAttr < todayStr) {
      day.style.display = "none";
    } else {
      day.style.display = "";
    }
  });
}

function searchName() {
  if (currentView !== 'all') return;

  const q = document.getElementById("searchInput").value.toLowerCase().trim();

  if (q === "") {
    applyDateFilter();
    return;
  }

  document.querySelectorAll(".day").forEach(day => {
    const text = day.textContent.toLowerCase();
    if (text.includes(q)) {
      day.style.display = "";
    } else {
      day.style.display = "none";
    }
  });
}

function updateCounter(count) {
    const el = document.getElementById('shift-counter');
    if (currentView === 'mine') {
        el.style.display = 'block';
        if (savedNames.length === 0) {
            el.innerHTML = "No tienes nombres guardados. Ve a 'Todos los Turnos', busca tu nombre y marca la estrella ★.";
        } else if (count === 0) {
             el.innerHTML = "No tienes turnos programados en el futuro.";
        } else {
             el.innerHTML = `Tienes ${count} turno(s) programado(s).`;
        }
    } else {
        el.style.display = 'none';
    }
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  searchName();
}

function initFirestoreListener() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = "Cargando turnos...";

  if (!db) {
    // Fallback if Firebase not configured yet (or offline?)
    // In beta, we might want to warn user
    container.innerHTML = "<p>Firebase no está configurado. Reemplaza las claves en app-beta.js.</p>";
    return;
  }

  // Real-time listener
  // We need to fetch days AND shifts.
  // Structure:
  // 1. Fetch Days to get the structure (Date -> Label, Managers)
  // 2. Fetch Shifts (Shifts Collection)

  // To keep it simple for now, we will just listen to shifts and days

  db.collection("days").orderBy("date").onSnapshot(snapshot => {
    const days = [];
    snapshot.forEach(doc => {
      days.push(doc.data());
    });

    // Now fetch shifts. Since we need to merge them, we can do a second listener
    // Ideally we would combine this, but for now let's query all shifts
    // Optimisation: Query only future shifts? For now, all.

    db.collection("shifts").onSnapshot(shiftSnap => {
        const shifts = [];
        shiftSnap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id; // needed for updates
            shifts.push(data);
        });

        // Merge Data into scheduleData structure
        scheduleData = days.map(d => {
            // Find shifts for this day
            const dayShifts = shifts.filter(s => s.date === d.date);

            // Managers is an array of objects
            const managersMap = new Map();
            if (d.managers) {
                d.managers.forEach(m => managersMap.set(m.name, m));
            }

            // Slots logic
            // Map Shift DB Object to App Slot Object
            const slots = dayShifts.map(s => ({
               id: s.id,
               loc: s.location,
               time: s.time,
               names: s.participants,
               status: s.status
            }));

            return {
                date: d.date,
                dayLabel: d.dayLabel,
                managers: managersMap,
                slots: slots
            };
        });

        renderSchedule();
        applyDateFilter();

    }, error => {
        console.error("Error fetching shifts", error);
    });

  }, error => {
      console.error("Error fetching days", error);
      container.innerHTML = "Error cargando calendario. Revisa la consola.";
  });
}

function takeShift(slotId) {
    if (!confirm("¿Confirmas que quieres tomar este turno?")) return;

    const docRef = db.collection("shifts").doc(slotId);

    db.runTransaction(transaction => {
        return transaction.get(docRef).then(doc => {
            if (!doc.exists) throw "Shift does not exist!";

            const data = doc.data();
            if (data.status !== 'open') throw "Este turno ya no está disponible.";

            // Logic: Remove "Disponible" placeholder, Add User Name
            // Warning: This assumes only one "Disponible" slot exists or we are taking one of them.
            // If multiple spots are open, we just fill one.

            // Find index of a "Disponible" string
            const availableIndex = data.participants.findIndex(p => p.toLowerCase().includes("disponible"));

            let newParticipants = [...data.participants];
            if (availableIndex !== -1) {
                newParticipants[availableIndex] = linkedName;
            } else {
                // Should not happen if status is open, but just in case
                newParticipants.push(linkedName);
            }

            // Check if there are any other "Disponible" left
            const stillOpen = newParticipants.some(p => p.toLowerCase().includes("disponible"));

            transaction.update(docRef, {
                participants: newParticipants,
                status: stillOpen ? 'open' : 'full'
            });
        });
    }).then(() => {
        alert("¡Turno asignado exitosamente!");
        // UI updates automatically via onSnapshot
    }).catch(err => {
        console.error("Take Shift failed: ", err);
        alert("Error al tomar el turno: " + err);
    });
}

function cancelShift(slotId) {
    if (!confirm("¿Seguro que deseas cancelar tu asistencia a este turno?")) return;

    const docRef = db.collection("shifts").doc(slotId);

    db.runTransaction(transaction => {
        return transaction.get(docRef).then(doc => {
            if (!doc.exists) throw "Shift does not exist!";

            const data = doc.data();
            const newParticipants = data.participants.map(p => {
                if (p === linkedName) return "Disponible";
                return p;
            });

            transaction.update(docRef, {
                participants: newParticipants,
                status: 'open' // Always open if someone cancels
            });
        });
    }).then(() => {
        alert("Turno cancelado.");
    }).catch(err => {
        console.error("Cancel Shift failed: ", err);
        alert("Error al cancelar: " + err);
    });
}
