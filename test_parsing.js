const fs = require('fs');

// Mock data from the csv file
const csvText = fs.readFileSync('data.csv', 'utf8');

// Copied from app.js
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

    const slot1Names = getVal(row, 2); 
    const slot2Names = getVal(row, 3); 
    const slot3Names = getVal(row, 4); 
    
    const managerName = getVal(row, 5);

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
        dayObj.managers.set(managerName, { role: role, name: managerName, link: null });
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


const rows = parseCSV(csvText);
console.log("Header Found At Row:", rows[0].map(c => c.substring(0, 10)));
const data = parseData(rows);

// Debug Output
console.log("Parsed Days Count:", data.length);
if (data.length > 0) {
    console.log("Sample Day:", data[0].dayLabel);
    console.log("Managers:", data[0].managers);
    console.log("Slots:", JSON.stringify(data[0].slots, null, 2));
}
