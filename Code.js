function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Transporte Campo Verde')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Auxiliar interna para validar accesos en el servidor de forma segura
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
  // Seguridad: Solo permite leer los correos si el PIN proveído es de administrador
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
  // Seguridad: Bloquea la escritura si no es un administrador real
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
    // Para el envío automático usamos un bypass interno seguro de lectura
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
    if (row[0] && row[7] !== 'Cancelado') {
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
  let pasajerosOriginalesStr = "";
  let pasajerosTomados = parseInt(data.pasajerosTomados) || 1;
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
      break;
    }
  }

  if (rowIdx === -1) return { success: false, mensaje: "Viaje no encontrado" };

  let originalPasajeros = parseInt(pasajerosOriginalesStr) || 1;
  let isPlus = pasajerosOriginalesStr.includes("+");
  let remaining = originalPasajeros - pasajerosTomados;

  if (remaining > 0 || (remaining === 0 && isPlus)) {
    // Reclamo parcial
    let remainingStr = (remaining === 0 && isPlus) ? "1+" : (remaining.toString() + (isPlus ? "+" : ""));
    if (remainingStr === "0+") remainingStr = "1+"; // just in case

    // Actualizar la fila original con la cantidad restante y mantener pendiente
    solSheet.getRange(rowIdx, 7).setValue(remainingStr);

    // Crear una nueva fila para la porción asignada
    const newId = new Date().getTime().toString() + "_P";
    let notasFinales = rowData[9] || '';
    if (data.notasConductor) {
      notasFinales += (notasFinales ? " | " : "") + "Notas Conductor: " + data.notasConductor;
    }

    solSheet.appendRow([
      newId,
      rowData[1], // nombre
      rowData[2], // fecha
      rowData[3], // ubicacion
      rowData[4], // telefono
      rowData[5], // tipo
      pasajerosTomados.toString() + (pasajerosTomados === originalPasajeros && isPlus ? "+" : ""),
      'Asignado',
      data.conductorNombre,
      notasFinales
    ]);
  } else {
    // Reclamo total
    solSheet.getRange(rowIdx, 8).setValue('Asignado');
    solSheet.getRange(rowIdx, 9).setValue(data.conductorNombre);

    let notasActuales = rowData[9] || '';
    if (data.notasConductor) {
      let nuevasNotas = notasActuales + (notasActuales ? " | " : "") + "Notas Conductor: " + data.notasConductor;
      solSheet.getRange(rowIdx, 10).setValue(nuevasNotas);
    }
  }

  asigSheet.appendRow([data.id, data.conductorNombre, data.conductorTel, data.asignadoPor]);

  let waNumber = telefonoPublicador.replace(/\D/g, '');
  if (waNumber.startsWith('0')) waNumber = '595' + waNumber.substring(1);
  else if (!waNumber.startsWith('595')) waNumber = '595' + waNumber;

  let mensaje = `Hola ${nombrePublicador}, soy ${data.conductorNombre}. Acepté llevar a ${pasajerosTomados} persona(s) a la reunión el ${fechaViaje}.`;
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
  // Seguridad: Evita modificaciones externas maliciosas
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
  // Seguridad: Evita cancelaciones externas de sabotaje
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
