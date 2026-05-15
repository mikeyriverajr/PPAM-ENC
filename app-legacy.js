// Global variables
const SHEET_ID = '1SuiFgX2XiBeVec6bCeJFRhXPuTUEdYe7IIa105NI8jY';
let ADMIN_PHONE = '595983281197'; // Default fallback

// Will hold the final structured data
let scheduleData = [];
let savedNames = [];
let currentView = 'all'; // 'all', 'mine', or 'available'

// Debug info for Admin Panel
window.debugPhoneSource = "Default (Not loaded)";

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
  
  // Initialize App
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
  applyDateFilter();
}

function switchTab(tab) {
  currentView = tab;
  
  document.getElementById('tab-all').className = tab === 'all' ? 'tab active' : 'tab';
  document.getElementById('tab-mine').className = tab === 'mine' ? 'tab active' : 'tab';
  document.getElementById('tab-available').className = tab === 'available' ? 'tab active' : 'tab';
  
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
  applyDateFilter();
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
          i++; 
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
        if (char === '\r' && nextChar === '\n') i++; 
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
  const getVal = (r, c) => {
    if (!r || !r[c]) return "";
    return r[c].trim();
  };

  // 1. Strict Header Detection
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const val0 = getVal(rows[i], 0).toLowerCase();
    const val1 = getVal(rows[i], 1).toLowerCase();
    if (val0.includes("fecha") && val1.includes("ubicación")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error("No se encontró la fila de encabezado ('Fecha', 'Ubicación').");
  }
  
  // 2. Dynamic Column Mapping (Strict)
  let managerColIndex = -1; 
  let linkColIndex = -1;
  const slotColumns = []; 

  const headerRow = rows[headerIndex];
  for (let c = 0; c < headerRow.length; c++) {
      const headerVal = headerRow[c].toLowerCase().trim();
      
      if (headerVal.includes("fecha") || headerVal.includes("ubicación") || headerVal.includes("ubicacion")) continue;
      
      if (headerVal.includes("encargado")) {
          managerColIndex = c;
          continue;
      }
      
      if (headerVal.includes("enlace") || headerVal.includes("link")) {
          linkColIndex = c;
          continue;
      }
      
      // Strict: Only consider it a time slot if it contains digits (e.g., "8 a 10")
      // This ignores "Notas", empty columns, or random text.
      if (headerVal.match(/\d/)) {
          slotColumns.push({ index: c, label: headerRow[c].trim() });
      }
  }
  
  if (managerColIndex === -1 && rows[0].length > 5) managerColIndex = 5;

  const daysMap = new Map(); 
  let lastDateStr = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Fill-down logic for Date
    let dateStr = getVal(row, 0);
    
    // Safety check: Don't process rows that clearly aren't dates (e.g. random text below schedule)
    // Only apply fill-down if the current cell is empty.
    if (!dateStr) {
       if (lastDateStr) {
         dateStr = lastDateStr;
       } else {
         continue; // Skip empty rows before first date
       }
    } else {
       // New date found. Is it valid?
       // parseSpanishDate returns year-month-day or throws/defaults?
       // It currently defaults to 2026-01-01 if it fails.
       // We can check if it looks like a date string (has spaces, month name, etc)
       if (!dateStr.match(/\d/) && !dateStr.toLowerCase().match(/[a-z]/)) {
           // Maybe just symbols?
           continue; 
       }
       lastDateStr = dateStr;
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

    slotColumns.forEach(col => {
        const names = getVal(row, col.index);
        addSlot(col.label, names);
    });
  }

  const result = [];
  daysMap.forEach((dayObj, dateStr) => {
    const managersArray = Array.from(dayObj.managers.values());
    const slotsArray = Array.from(dayObj.slotsMap.values()).filter(s => s.names.length > 0);
    
    slotsArray.sort((a, b) => {
      const pad = (s) => {
        const match = s.match(/(\d{1,2})[:\s]?(?:\d{2})?\s*(?:a|–|-|—)/); 
        if (!match) {
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
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${d}`;

  scheduleData.forEach(day => {
    let visibleSlots = day.slots;
    
    if (currentView === 'mine') {
      if (savedNames.length === 0) {
         visibleSlots = [];
      } else {
         visibleSlots = day.slots.filter(slot => {
           const isParticipant = slot.names.some(n => savedNames.includes(n));
           if (isParticipant) return true;

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

    if (currentView === 'mine' && day.date >= todayStr) {
        const amIManager = Array.from(day.managers.values()).some(m => savedNames.includes(m.name));
        if (amIManager) {
            if (visibleSlots.length > 0) myShiftCount++;
        } else {
            visibleSlots.forEach(slot => {
                myShiftCount++;
            });
        }
    }

    if ((currentView === 'mine' || currentView === 'available') && visibleSlots.length === 0) {
        return; 
    }
    
    const dayDiv = document.createElement('div');
    dayDiv.className = 'day';
    dayDiv.setAttribute('data-date', day.date);
    
    let html = `<h2>${day.dayLabel}</h2>`;
    
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

      const dateStr = day.date.replace(/-/g, '');
      const times = slot.time.match(/(\d{1,2}(?::\d{2})?)\s*(?:a|–|-|—)\s*(\d{1,2}(?::\d{2})?)/);
      let calendarActions = "";
      
      if (times) {
        const normalizeTime = (t) => t.includes(':') ? t : t + ":00";
        const startTime = normalizeTime(times[1]);
        const endTime = normalizeTime(times[2]);

        const start = startTime.replace(':', '').padStart(4,'0') + "00";
        const end = endTime.replace(':', '').padStart(4,'0') + "00";
        const title = `${slot.loc} – PPAM`;
        const details = `Asignados: ${slot.names.join(', ')}`;
        const locationStr = slot.loc;
        
        const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dateStr}T${start}/${dateStr}T${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(locationStr)}&ctz=America/Asuncion`;
        
        const icsContent = generateICS(title, day.date, startTime, endTime, locationStr, details);
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

// Data Fetching with Config Sheet Support
function fetchData() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = "Cargando datos...";

  const urlSchedule = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Programa`;
  const urlConfig = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=ProgramaNEV`;

  Promise.all([
      fetch(urlSchedule).then(r => r.ok ? r.text() : ""),
      fetch(urlConfig).then(r => r.ok ? r.text() : "")
  ])
  .then(([csvSchedule, csvConfig]) => {
      // 1. Process Config (Phone)
      if (csvConfig) {
          const configRows = parseCSV(csvConfig);
          // Search for phone in ProgramaNEV
          let foundPhone = null;
          for (const row of configRows) {
              for (const cell of row) {
                  const digits = cell.replace(/\D/g, '');
                  if (digits.length >= 10) {
                      foundPhone = digits;
                      window.debugPhoneSource = `ProgramaNEV: ${cell}`;
                      break;
                  }
              }
              if (foundPhone) break;
          }
          if (foundPhone) {
              ADMIN_PHONE = foundPhone;
              console.log("Admin Phone loaded from ProgramaNEV:", ADMIN_PHONE);
          } else {
              window.debugPhoneSource = "ProgramaNEV found but no phone number detected";
          }
      } else {
          window.debugPhoneSource = "ProgramaNEV fetch failed (using default)";
      }

      // 2. Process Schedule
      if (!csvSchedule || csvSchedule.length === 0) {
         container.innerHTML = "No se encontraron datos en la planilla.";
         return;
      }
      
      const rows = parseCSV(csvSchedule);
      scheduleData = parseData(rows);
      renderSchedule();
      applyDateFilter();
  })
  .catch(error => {
      console.error('Error fetching data:', error);
      container.innerHTML = `
        <div style="color: red; padding: 20px; text-align: center; border: 2px solid red; border-radius: 10px; background: #fff0f0;">
          <h3>Error al cargar los datos</h3>
          <p>Por favor revisa tu conexión a internet.</p>
          <p style="font-family: monospace; background: #eee; padding: 10px; border-radius: 5px;">${error.message}</p>
        </div>
      `;
  });
}

// --- Admin Functions ---

function toggleAdminPanel() {
  const panel = document.getElementById('admin-panel');
  if (panel.style.display === 'none') {
    const password = prompt("Ingrese contraseña de administrador:");
    if (password === 'ppam2026') {
      panel.style.display = 'block';
      
      const adminInfo = document.getElementById('admin-info-display');
      const content = `
          <strong>Número Admin Actual:</strong> ${ADMIN_PHONE} <br>
          <small>Fuente: ${window.debugPhoneSource || 'Default'}</small>
      `;

      if (!adminInfo) {
          const infoDiv = document.createElement('div');
          infoDiv.id = 'admin-info-display';
          infoDiv.style.marginTop = '10px';
          infoDiv.style.fontSize = '0.9em';
          infoDiv.style.color = '#555';
          infoDiv.innerHTML = content;
          panel.appendChild(infoDiv);
      } else {
          adminInfo.innerHTML = content;
      }
    } else {
      alert("Contraseña incorrecta.");
    }
  } else {
    panel.style.display = 'none';
  }
}

function generateWeeklyReport() {
  const output = document.getElementById('admin-output');
  output.innerHTML = "Generando...";

  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  
  const todayStr = today.toISOString().split('T')[0];
  const nextWeekStr = nextWeek.toISOString().split('T')[0];
  
  const upcomingDays = scheduleData.filter(d => d.date >= todayStr && d.date <= nextWeekStr);
  
  if (upcomingDays.length === 0) {
    output.innerHTML = "No hay turnos en los próximos 7 días.";
    return;
  }
  
  let report = `📅 *Recordatorio Semanal de Turnos*\n`;
  report += `Del ${formatDateShort(todayStr)} al ${formatDateShort(nextWeekStr)}\n`;
  report += `_Por favor confirmen su asistencia con un emoji_ 👍\n\n`;
  
  upcomingDays.forEach(day => {
    let dayHasSlots = false;
    let dayText = `*${day.dayLabel}:*\n`;
    
    day.slots.forEach(slot => {
        const assignedNames = slot.names.filter(n => !n.toLowerCase().includes("disponible"));
        
        if (assignedNames.length > 0) {
            dayHasSlots = true;
            const taggedNames = assignedNames.map(n => `${n.trim()}`).join(", ");
            dayText += `🕒 ${slot.time}: ${taggedNames} (${slot.loc})\n`;
        }
    });
    
    if (day.managers.size > 0) {
        dayHasSlots = true;
        const mgrs = Array.from(day.managers.values()).map(m => `${m.name}`).join(", ");
        dayText += `👤 Encargado: ${mgrs}\n`;
    }
    
    if (dayHasSlots) {
        report += dayText + "\n";
    }
  });
  const textarea = document.createElement('textarea');
  textarea.value = report;
  
  const copyBtn = document.createElement('button');
  copyBtn.innerText = "Copiar Texto";
  copyBtn.onclick = () => {
    textarea.select();
    document.execCommand('copy');
    alert("Copiado al portapapeles");
  };
  
  const waBtn = document.createElement('a');
  waBtn.href = `https://wa.me/?text=${encodeURIComponent(report)}`;
  waBtn.target = "_blank";
  waBtn.innerHTML = "<button style='background:#25D366; margin-left:10px;'>Enviar a WhatsApp</button>";
  
  output.innerHTML = "";
  output.appendChild(textarea);
  output.appendChild(document.createElement('br'));
  output.appendChild(copyBtn);
  output.appendChild(waBtn);
}

function formatDateShort(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`;
}
