// Global variables
const SHEET_ID = '1SuiFgX2XiBeVec6bCeJFRhXPuTUEdYe7IIa105NI8jY';
const API_KEY = 'AIzaSyDfsWBhEVTd8Ogv2CxBqWKxBDVCQBshAfA';
const RANGE = 'A:F';
const ADMIN_PHONE = '595983281197';

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
  loadFavorites();
  
  if (savedNames.length > 0) {
    currentView = 'mine';
  } else {
    currentView = 'all';
  }
  
  switchTab(currentView);
  
  fetchData();
});

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
  
  // Toggle Search & Instructions visibility
  const searchContainer = document.getElementById('search-container');
  const instructions = document.getElementById('all-view-instructions');
  
  if (tab === 'mine' || tab === 'available') {
    searchContainer.style.display = 'none';
    instructions.style.display = 'none';
  } else {
    searchContainer.style.display = 'flex';
    instructions.style.display = 'block';
  }

  renderSchedule();
  applyDateFilter(); // Ensure dates are filtered again
}

function parseData(rows) {
  // rows is an array of rowData objects
  
  // Helper to safely get value from row/col
  const getVal = (r, c) => {
    if (!r.values || !r.values[c]) return "";
    return r.values[c].formattedValue || "";
  };
  
  const getLink = (r, c) => {
    if (!r.values || !r.values[c]) return null;
    return r.values[c].hyperlink || null;
  };

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

  const daysMap = new Map(); 
  let lastDateStr = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Fill-down logic for Date
    let dateStr = getVal(row, 0).trim();
    if (dateStr) {
      lastDateStr = dateStr;
    } else if (lastDateStr) {
      dateStr = lastDateStr;
    } else {
      continue;
    }

    const location = getVal(row, 1).trim();
    if (!location) continue;

    const slot1Names = getVal(row, 2).trim(); 
    const slot2Names = getVal(row, 3).trim(); 
    const slot3Names = getVal(row, 4).trim(); 
    
    const managerName = getVal(row, 5).trim();
    const managerLink = getLink(row, 5);

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

    addSlot("8:00 – 10:00", slot1Names);
    addSlot("10:00 – 12:00", slot2Names);
    addSlot("18:30 – 20:30", slot3Names);
  }

  // Convert Map to Array
  const result = [];
  daysMap.forEach((dayObj, dateStr) => {
    const managersArray = Array.from(dayObj.managers.values());
    const slotsArray = Array.from(dayObj.slotsMap.values()).filter(s => s.names.length > 0);
    
    // Sort slots
    slotsArray.sort((a, b) => {
      const pad = (s) => {
        const match = s.match(/\d{1,2}:\d{2}/);
        if (!match) return s;
        return match[0].padStart(5, '0'); 
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
        return slot.names.some(n => n.toLowerCase().includes("disponible"));
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
    
    // Only show managers if NOT in "Available" view (usually they don't care who the manager is when looking for open slots, or maybe they do? Let's keep it clean for now, or show it. User didn't specify. Standard 'All' view shows it. Let's hide it for 'Available' to focus on the task.)
    // Update: User might want to know who is managing. Let's keep it but maybe it's less critical. Let's keep it for context.
    
    if (day.managers && day.managers.length > 0) {
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
      slot.names.forEach(n => {
        const isDisponible = n.toLowerCase().includes("disponible");
        
        if (isDisponible) {
           const message = `Hola, quisiera cubrir el turno disponible del ${day.dayLabel} a las ${slot.time} en ${slot.loc}.`;
           const whatsappUrl = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(message)}`;
           
           listHtml += `<li>
             <a href="${whatsappUrl}" target="_blank" class="cubrir-btn">Cubrir el turno</a>
           </li>`;
        } else {
            const isFav = savedNames.includes(n);
            const starClass = isFav ? "star-btn active" : "star-btn";
            const starIcon = isFav ? "★" : "☆";
            const safeName = n.replace(/'/g, "\\'");
            
            listHtml += `<li>
              ${n} 
              <button class="${starClass}" onclick="toggleFavorite('${safeName}')" title="${isFav ? 'Quitar de mis turnos' : 'Agregar a mis turnos'}">${starIcon}</button>
            </li>`;
        }
      });

      // Calendar Buttons
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

function fetchData() {
  const fields = "sheets(data(rowData(values(formattedValue,hyperlink))))";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?includeGridData=true&ranges=Programa!${RANGE}&fields=${fields}&key=${API_KEY}`;
  
  const container = document.getElementById('schedule-container');
  container.innerHTML = "Cargando datos...";

  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok: ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      if (!data.sheets || !data.sheets[0] || !data.sheets[0].data || !data.sheets[0].data[0].rowData) {
         container.innerHTML = "No se encontraron datos en la planilla.";
         return;
      }

      const rows = data.sheets[0].data[0].rowData;
      
      scheduleData = parseData(rows);
      renderSchedule();
      
      applyDateFilter();
    })
    .catch(error => {
      console.error('Error fetching data:', error);
      container.innerHTML = `
        <div style="color: red; padding: 20px; text-align: center; border: 2px solid red; border-radius: 10px; background: #fff0f0;">
          <h3>Error al cargar los datos</h3>
          <p>Es posible que la restricción de seguridad de Google esté bloqueando el acceso en este dispositivo.</p>
          <p style="font-family: monospace; background: #eee; padding: 10px; border-radius: 5px;">${error.message}</p>
        </div>
      `;
    });
}
