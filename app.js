// Global variables
const SHEET_ID = '1SuiFgX2XiBeVec6bCeJFRhXPuTUEdYe7IIa105NI8jY';
const API_KEY = 'AIzaSyDfsWBhEVTd8Ogv2CxBqWKxBDVCQBshAfA';
const RANGE = 'A:F';
// Year logic will be handled inside parseSpanishDate

// Will hold the final structured data
let scheduleData = [];

document.addEventListener("DOMContentLoaded", function () {
  fetchData();
});

function parseData(rows) {
  // rows is an array of rowData objects: { values: [ { formattedValue: "...", hyperlink: "..." }, ... ] }
  
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
    
    // Check for "Fecha" in column 0, and "Ubicación" in column 1
    if (val0.toLowerCase().includes("fecha") && val1.toLowerCase().includes("ubicación")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Could not find header row. Assuming row 0 is header.");
    headerIndex = 0;
  }

  const daysMap = new Map(); // Key: Date String, Value: Day Object
  let lastDateStr = "";

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Handle merged cells / fill-down logic for Date
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

    const slot1Names = getVal(row, 2).trim(); // 8 a 10
    const slot2Names = getVal(row, 3).trim(); // 10 a 12
    const slot3Names = getVal(row, 4).trim(); // 18:30 a 20:30
    
    const managerName = getVal(row, 5).trim();
    const managerLink = getLink(row, 5);

    if (!daysMap.has(dateStr)) {
      daysMap.set(dateStr, {
        date: parseSpanishDate(dateStr),
        dayLabel: dateStr,
        managers: new Map(), // Key: Name, Value: { role, name, link } (Map prevents duplicates)
        slotsMap: new Map() 
      });
    }

    const dayObj = daysMap.get(dateStr);

    // Add manager if present
    if (managerName) {
      // Determine role based on location
      let role = "Encargado";
      if (location.toLowerCase().includes("costanera")) {
        role = "Encargado Costanera";
      } else if (location.toLowerCase().includes("liberty")) {
        role = "Encargado del día";
      }
      
      // We key by name to avoid duplicates if same manager is listed for multiple rows of same day
      if (!dayObj.managers.has(managerName)) {
        dayObj.managers.set(managerName, { role: role, name: managerName, link: managerLink });
      } else {
        // Optional: Update role if hierarchy? 
        // If we already have them as "Encargado del día", keep it.
        // But if they appear again, it's fine.
      }
    }

    // Helper to add names to a slot
    const addSlot = (timeLabel, namesStr) => {
      if (!namesStr || !location) return;
      
      // Filter out "No hay turno"
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
        // Double check against "No hay turno" if it was part of a list?
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
    // Convert managers Map to Array
    const managersArray = Array.from(dayObj.managers.values());

    // Convert slotsMap to Array
    const slotsArray = Array.from(dayObj.slotsMap.values());
    
    // Sort slots by time.
    // We assume time format "H:MM" or "HH:MM".
    // "8:00" should come before "10:00". localeCompare sorts "10" before "8".
    // So we pad with leading zero if needed for comparison.
    slotsArray.sort((a, b) => {
      const pad = (s) => {
        const match = s.match(/\d{1,2}:\d{2}/);
        if (!match) return s;
        return match[0].padStart(5, '0'); // "8:00" -> "08:00"
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
  // Expected format: "viernes 2 enero" or "viernes 2 de enero"
  // Returns YYYY-MM-DD
  const months = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04", 
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08", 
    "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
  };
  
  const lower = dateStr.toLowerCase();
  let day = "01";
  let month = "01";
  let year = 2026; // Default to 2026 (Jan/Feb/etc)

  // Extract number
  const dayMatch = lower.match(/\d{1,2}/);
  if (dayMatch) {
    day = dayMatch[0].padStart(2, '0');
  }
  
  // Extract month
  for (const [name, code] of Object.entries(months)) {
    if (lower.includes(name)) {
      month = code;
      // Hardcoded logic for this specific schedule transition
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
  
  scheduleData.forEach(day => {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'day';
    // Store raw date for filtering
    dayDiv.setAttribute('data-date', day.date);
    
    // Header del día
    let html = `<h2>${day.dayLabel}</h2>`;
    
    // Encargados
    if (day.managers && day.managers.length > 0) {
      html += `<div class="encargado">`;
      day.managers.forEach(mgr => {
        const content = mgr.link 
          ? `<a href="${mgr.link}" target="_blank">${mgr.name}</a>` 
          : mgr.name;
        html += `<div><strong>${mgr.role}:</strong> ${content}</div>`;
      });
      html += `</div>`;
    }

    // Grilla de Turnos
    html += `<div class="schedule">`;
    
    day.slots.forEach(slot => {
      let icon = "🕘";
      if (slot.time.includes("8:00")) icon = "🕗";
      if (slot.time.includes("10:00")) icon = "🕙";
      if (slot.time.includes("18:30")) icon = "🕡";

      let listHtml = "";
      slot.names.forEach(n => listHtml += `<li>${n}</li>`);

      // Calendar Buttons
      // Google Calendar Link
      const dateStr = day.date.replace(/-/g, '');
      // slot.time is like "8:00 – 10:00"
      const times = slot.time.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
      let calendarActions = "";
      
      if (times) {
        const start = times[1].replace(':', '').padStart(4,'0') + "00";
        const end = times[2].replace(':', '').padStart(4,'0') + "00";
        const title = `${slot.loc} – PPAM`;
        const details = `Asignados: ${slot.names.join(', ')}`;
        const locationStr = slot.loc;
        
        const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dateStr}T${start}/${dateStr}T${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(locationStr)}&ctz=America/Asuncion`;
        
        // ICS Generation
        // We will store the data in data attributes to generate on click to avoid heavy DOM on load if not needed? 
        // Or just generate the blob link now. 
        // Let's make a function to generate ICS content.
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

    html += `</div>`; // cierre .schedule
    dayDiv.innerHTML = html;
    container.appendChild(dayDiv);
  });
}

function generateICS(title, date, startTime, endTime, location, description) {
  // date is YYYY-MM-DD
  // time is HH:MM
  const formatTime = (t) => {
    // Ensure we have HHMMSS format (6 digits)
    const raw = t.replace(':', ''); 
    // If raw is "800", we need "0800". If "1000", we need "1000".
    // Then add "00" for seconds.
    // Actually, safest is to parse strictly.
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
  // Construct YYYY-MM-DD using local time
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${d}`;
  
  document.querySelectorAll(".day").forEach(day => {
    const dateAttr = day.getAttribute('data-date');
    if (!dateAttr) return;
    
    // Parse the attribute date
    // Note: data-date is YYYY-MM-DD
    const dayDate = new Date(dateAttr + "T00:00:00");
    
    // Style "Today"
    if (dateAttr === todayStr) {
      day.classList.add("today");
    } else {
      day.classList.remove("today");
    }

    // Hide past days logic
    // We compare strings or timestamps. 
    if (dateAttr < todayStr) {
      day.style.display = "none";
    } else {
      day.style.display = "";
    }
  });
}

function searchName() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  
  // If search is empty, re-apply the date filter (hide past)
  if (q === "") {
    applyDateFilter();
    return;
  }

  // If searching, show all matching days, even past ones
  document.querySelectorAll(".day").forEach(day => {
    const text = day.textContent.toLowerCase();
    if (text.includes(q)) {
      day.style.display = "";
    } else {
      day.style.display = "none";
    }
  });
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  searchName();
}

function fetchData() {
  // We use spreadsheets.get with includeGridData to get hyperlinks
  // We restrict fields to minimize data transfer, getting formattedValue and hyperlink
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
      // Navigate the nested structure: sheets[0].data[0].rowData
      if (!data.sheets || !data.sheets[0] || !data.sheets[0].data || !data.sheets[0].data[0].rowData) {
         container.innerHTML = "No se encontraron datos en la planilla.";
         return;
      }

      const rows = data.sheets[0].data[0].rowData;
      
      // Parse the data
      scheduleData = parseData(rows);
      renderSchedule();
      
      // Initial filter (hide past days)
      applyDateFilter();
    })
    .catch(error => {
      console.error('Error fetching data:', error);
      container.innerHTML = `<p>Error al cargar los datos. Por favor verifica tu conexión o la configuración.</p><pre>${error.message}</pre>`;
    });
}
