function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Transporte Campo Verde')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function authCheck(pin, requiredRole) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuración');
    const data = sheet.getDataRange().getValues();
    let userPin = null, adminPin = null;

    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'PIN Usuario') userPin = data[i][1].toString().trim();
      if (data[i][0] === 'PIN Admin') adminPin = data[i][1].toString().trim();
    }

    const inputPin = pin ? pin.toString().trim() : "";
    if (inputPin === adminPin) return 'admin';
    if (inputPin === userPin && requiredRole !== 'admin') return 'user';
    return 'invalid';
  } catch (e) { return 'invalid'; }
}

function verifyPin(pin) {
  return authCheck(pin, 'user');
}

function getAdminEmails(pin) {
  if (authCheck(pin, 'admin') !== 'admin') return "Acceso Denegado";

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuración');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'Correos Notificación') {
      return data[i][1].toString().trim();
    }
  }
  return "";
}

function updateAdminEmails(pin, emails) {
  if (authCheck(pin, 'admin') !== 'admin') throw new Error("No autorizado");

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuración');
  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'Correos Notificación') {
      sheet.getRange(i + 1, 2).setValue(emails);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow(['Correos Notificación', emails]);
  }
  return true;
}

function submitRequest(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes');
  const id = new Date().getTime().toString();
  sheet.appendRow([id, data.nombre, data.fecha, data.ubicacion, data.telefono, data.tipo, data.pasajeros, 'Pendiente', '', data.notas || '']);

  try {
    const confSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuración');
    const confData = confSheet.getDataRange().getValues();
    let emailList = "";
    for (let i = 0; i < confData.length; i++) {
      if (confData[i][0] === 'Correos Notificación') { emailList = confData[i][1].toString().trim(); break; }
    }

    if (emailList && emailList.length > 0) {
      const appUrl = ScriptApp.getService().getUrl();
      const subject = "🚙 Nuevo viaje solicitado: Transporte Campo Verde";
      const body = `Hola,\n\nSe ha solicitado un nuevo viaje en la pizarra.\n\n` +
                   `Pasajero: ${data.nombre}\n` +
                   `Fecha: ${data.fecha}\n` +
                   `Tipo: ${data.tipo} (${data.pasajeros})\n` +
                   `Ubicación: ${data.ubicacion || 'No especificada'}\n` +
                   `Notas: ${data.notas || 'Ninguna'}\n\n` +
                   `Puedes aceptar este viaje ingresando al tablero aquí:\n${appUrl}\n\n` +
                   `Saludos,\nSistema de Transporte Campo Verde`;

      MailApp.sendEmail({ bcc: emailList, subject: subject, body: body });
    }
  } catch (e) { console.error("Error en notificación: " + e.message); }

  return true;
}

function getAllRequests() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes');
  const data = sheet.getDataRange().getValues();
  data.shift();

  let requests = [];
  data.forEach(row => {
    if (row[0] && row[7] !== 'Cancelado' && row[7] !== 'Oculto') {
      const dateObj = new Date(row[2]);
      requests.push({
        id: row[0],
        nombre: row[1],
        fechaRaw: Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        ubicacion: row[3],
        telefono: row[4],
        tipo: row[5],
        pasajeros: row[6],
        estado: row[7],
        conductor: row[8] || '',
        notas: row[9] || ''
      });
    }
  });
  return requests.reverse();
}

function claimRide(data) {
  const solSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes');
  const asigSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Asignaciones');
  const rows = solSheet.getDataRange().getValues();

  let telefonoPublicador = "", nombrePublicador = "", fechaViaje = "";
  let pasajerosOriginalesStr = "", tipoOriginal = "";
  let pasajerosTomados = parseInt(data.pasajerosTomados) || 1;
  let tramoTomado = data.tramoTomado || "Completo"; // "Completo", "Solo Ida", "Solo Vuelta"
  let rowIdx = -1;
  let rowData = null;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === data.id.toString()) {
      rowIdx = i + 1;
      rowData = rows[i];
      telefonoPublicador = rows[i][4].toString();
      nombrePublicador = rows[i][1].toString();
      fechaViaje = Utilities.formatDate(new Date(rows[i][2]), Session.getScriptTimeZone(), "dd/MM/yyyy");
      pasajerosOriginalesStr = rows[i][6].toString();
      tipoOriginal = rows[i][5].toString();
      break;
    }
  }

  if (rowIdx === -1) return { success: false, mensaje: "Viaje no encontrado" };

  let originalPasajeros = parseInt(pasajerosOriginalesStr) || 1;
  let isPlus = pasajerosOriginalesStr.includes("+");
  let remainingPasajeros = originalPasajeros - pasajerosTomados;

  let isTramoSplit = (tipoOriginal === "Ida y Vuelta" && tramoTomado !== "Completo");
  let isPassengerSplit = (remainingPasajeros > 0 || (remainingPasajeros === 0 && isPlus));

  let baseId = new Date().getTime().toString();

  // Format the driver notes once
  let notasFinalesAsignado = rowData[9] || '';
  if (data.notasConductor) {
    notasFinalesAsignado += (notasFinalesAsignado ? " | " : "") + "Notas Conductor: " + data.notasConductor;
  }

  if (!isTramoSplit && !isPassengerSplit) {
    // Escenario 1: Reclamo TOTAL (Ni tramo ni pasajeros se dividen)
    solSheet.getRange(rowIdx, 8).setValue('Asignado');
    solSheet.getRange(rowIdx, 9).setValue(data.conductorNombre);
    solSheet.getRange(rowIdx, 10).setValue(notasFinalesAsignado);
  } else if (!isTramoSplit && isPassengerSplit) {
    // Escenario 2: Se divide PASAJEROS, pero NO el tramo
    let remainingStr = (remainingPasajeros === 0 && isPlus) ? "1+" : (remainingPasajeros.toString() + (isPlus ? "+" : ""));
    if (remainingStr === "0+") remainingStr = "1+";

    // Original row gets remaining passengers and stays Pendiente
    solSheet.getRange(rowIdx, 7).setValue(remainingStr);

    // New row gets assigned portion
    solSheet.appendRow([
      baseId + "_P",
      rowData[1], rowData[2], rowData[3], rowData[4],
      tipoOriginal, // Mantiene el tipo original
      pasajerosTomados.toString() + (pasajerosTomados === originalPasajeros && isPlus ? "+" : ""),
      'Asignado', data.conductorNombre, notasFinalesAsignado
    ]);
  } else {
    // Escenario 3: Se divide el TRAMO (y posiblemente también los pasajeros)
    // Ocultamos la fila original de "Ida y Vuelta"
    solSheet.getRange(rowIdx, 8).setValue('Oculto');

    let tramoPendiente = (tramoTomado === "Solo Ida") ? "Solo Vuelta" : "Solo Ida";

    // Fila Asignada (lo que el conductor lleva)
    solSheet.appendRow([
      baseId + "_A",
      rowData[1], rowData[2], rowData[3], rowData[4],
      tramoTomado, // El tramo que se llevó
      pasajerosTomados.toString() + (pasajerosTomados === originalPasajeros && isPlus ? "+" : ""),
      'Asignado', data.conductorNombre, notasFinalesAsignado
    ]);

    // Fila Pendiente 1: ¿Sobraron pasajeros en el mismo tramo que tomó el conductor?
    if (isPassengerSplit) {
      let remainingStr = (remainingPasajeros === 0 && isPlus) ? "1+" : (remainingPasajeros.toString() + (isPlus ? "+" : ""));
      if (remainingStr === "0+") remainingStr = "1+";

      solSheet.appendRow([
        baseId + "_P1",
        rowData[1], rowData[2], rowData[3], rowData[4],
        tramoTomado, // Mismo tramo, pero lo que sobró
        remainingStr,
        'Pendiente', '', rowData[9] || ''
      ]);
    }

    // Fila Pendiente 2: El OTRO tramo completo que nadie tocó (con todos los pasajeros originales)
    solSheet.appendRow([
      baseId + "_P2",
      rowData[1], rowData[2], rowData[3], rowData[4],
      tramoPendiente, // El tramo que el conductor ignoró
      pasajerosOriginalesStr, // Nadie los llevó aún en este tramo
      'Pendiente', '', rowData[9] || ''
    ]);
  }

  asigSheet.appendRow([data.id, data.conductorNombre, data.conductorTel, data.asignadoPor]);

  let waNumber = telefonoPublicador.replace(/\D/g, '');
  if (waNumber.startsWith('0')) waNumber = '595' + waNumber.substring(1);
  else if (!waNumber.startsWith('595')) waNumber = '595' + waNumber;

  let tipoMensajeTxt = "";
  if (isTramoSplit) {
     tipoMensajeTxt = ` (${tramoTomado})`;
  } else if (tipoOriginal === "Solo Ida" || tipoOriginal === "Solo Vuelta") {
     tipoMensajeTxt = ` (${tipoOriginal})`;
  } // Si tomó Ida y Vuelta completo, no hace falta aclarar tanto, pero podriamos.

  let mensaje = `Hola ${nombrePublicador}, soy ${data.conductorNombre}. Acepté llevar a ${pasajerosTomados} persona(s)${tipoMensajeTxt} a la reunión el ${fechaViaje}.`;
  if (data.notasConductor) {
    mensaje += ` Nota: ${data.notasConductor}`;
  }
  mensaje += ` ¡Nos vemos!`;

  return {
    success: true,
    waNumber: waNumber,
    mensaje: mensaje
  };
}

function updateRequest(pin, data) {
  if (authCheck(pin, 'admin') !== 'admin') throw new Error("No autorizado");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes');
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === data.id.toString()) {
        sheet.getRange(i + 1, 2).setValue(data.nombre);
        sheet.getRange(i + 1, 3).setValue(data.fecha);
        sheet.getRange(i + 1, 4).setValue(data.ubicacion);
        sheet.getRange(i + 1, 5).setValue(data.telefono);
        sheet.getRange(i + 1, 6).setValue(data.tipo);
        sheet.getRange(i + 1, 7).setValue(data.pasajeros);
        sheet.getRange(i + 1, 8).setValue(data.estado);
        sheet.getRange(i + 1, 9).setValue(data.conductor);
        sheet.getRange(i + 1, 10).setValue(data.notas || '');
        break;
      }
    }
    return true;
  } catch (e) { throw new Error(e.message); }
}

function cancelRequest(pin, id) {
  if (authCheck(pin, 'admin') !== 'admin') throw new Error("No autorizado");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes');
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === id.toString()) {
        sheet.getRange(i + 1, 8).setValue('Cancelado');
        break;
      }
    }
    return true;
  } catch (e) { throw new Error(e.message); }
}
