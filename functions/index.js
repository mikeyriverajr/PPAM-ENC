const functions = require('firebase-functions/v1');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
admin.initializeApp();

const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function formatSpanishDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parseInt(parts[2])} de ${months[parseInt(parts[1]) - 1]}`;
}

// Helper function to grab the names of the publishers
async function getPubNames(userIds) {
    const db = admin.firestore();
    const names = [];
    for (const uid of userIds) {
        const doc = await db.collection('publishers').doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Un publicador';
            names.push(fullName);
        }
    }
    return names.join(', ');
}

exports.notifyShiftChanges = functions.firestore
    .document('shifts/{shiftId}')
    .onWrite(async (change, context) => {
        console.log(`[CEREBRO] Detectado un cambio en el turno: ${context.params.shiftId}`);

        if (!change.after.exists) {
            console.log("[CEREBRO] Turno eliminado.");
            const data = change.before.data();
            return notifyUsers(data.participants, 'Turno Cancelado ❌', `Tu turno del ${formatSpanishDate(data.date)} en ${data.location} ha sido eliminado del programa.`);
        }

        const afterData = change.after.data();
        const beforeData = change.before.exists ? change.before.data() : { participants: [] };

        const beforeParticipants = beforeData.participants || [];
        const afterParticipants = afterData.participants || [];

        console.log(`[CEREBRO] Participantes Antes: ${beforeParticipants.length}, Ahora: ${afterParticipants.length}`);

        // Calculate who was added, removed, and who stayed
        const added = afterParticipants.filter(uid => !beforeParticipants.includes(uid));
        const removed = beforeParticipants.filter(uid => !afterParticipants.includes(uid));
        const kept = afterParticipants.filter(uid => beforeParticipants.includes(uid)); // The remaining partners

        const promises = [];

        // 1. Handle New Additions
        if (added.length > 0) {
            console.log(`[CEREBRO] Notificando a ${added.length} nuevos asignados.`);
            promises.push(notifyUsers(added, '¡Nuevo Turno Asignado! 📅', `Tienes un nuevo turno el ${formatSpanishDate(afterData.date)} en ${afterData.location} (${afterData.time}).`));
            
            // Notify the partners who were already there
            if (kept.length > 0) {
                const addedNames = await getPubNames(added);
                promises.push(notifyUsers(kept, 'Nuevo compañero de turno 👋', `${addedNames} se ha unido a tu turno del ${formatSpanishDate(afterData.date)} en ${afterData.location}.`));
            }
        }

        // 2. Handle Removals
        if (removed.length > 0) {
            console.log(`[CEREBRO] Notificando a ${removed.length} removidos.`);
            promises.push(notifyUsers(removed, 'Turno Modificado ⚠️', `Ya no estás asignado al turno del ${formatSpanishDate(beforeData.date)} en ${beforeData.location}.`));
            
            // Notify the partners left behind
            if (kept.length > 0) {
                const removedNames = await getPubNames(removed);
                promises.push(notifyUsers(kept, 'Cambio en tu turno ⚠️', `${removedNames} ya no está en tu turno del ${formatSpanishDate(afterData.date)} en ${afterData.location}.`));
            }
        }

        if(added.length === 0 && removed.length === 0) {
            console.log("[CEREBRO] Nadie fue agregado ni removido. Ignorando.");
        }

        return Promise.all(promises);
    });

async function sendEmailNotification(email, title, body) {
    const gmailEmail = process.env.GMAIL_EMAIL;
    const gmailPassword = process.env.GMAIL_PASSWORD;

    if (!gmailEmail || !gmailPassword) {
        console.log("[CEREBRO] ⚠️ Credenciales de Gmail no configuradas en variables de entorno. Omitiendo email.");
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailEmail,
            pass: gmailPassword
        }
    });

    const mailOptions = {
        from: `"PPAM Encarnación" <${gmailEmail}>`,
        to: email,
        subject: title,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #5d7aa9; border-bottom: 2px solid #eee; padding-bottom: 10px;">PPAM Encarnación</h2>
                <p style="font-size: 16px; color: #333; line-height: 1.5;">${body}</p>
                <br>
                <div style="text-align: center; margin-top: 20px;">
                    <a href="https://mikeyriverajr.github.io/PPAM-ENC/beta.html" style="background-color: #5d7aa9; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Ir a la Aplicación</a>
                </div>
                <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">Este es un mensaje automático del generador de turnos PPAM. Por favor no responda a este correo.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[CEREBRO] ✅ Email enviado con éxito a: ${email}`);
    } catch (error) {
        console.error(`[CEREBRO] ❌ Error enviando email a ${email}:`, error);
    }
}

async function notifyUsers(userIds, title, body) {
    if (!userIds || userIds.length === 0) return null;
    const db = admin.firestore();
    const promises = [];

    for (const uid of userIds) {
        const pubDoc = await db.collection('publishers').doc(uid).get();
        if (pubDoc.exists) {
            const pubData = pubDoc.data();
            const token = pubData.fcmToken;
            if (token) {
                console.log(`[CEREBRO] Enviando Push a: ${pubData.firstName}`);
                const message = {
                    notification: { title: title, body: body },
                    token: token,
                    webpush: {
                        notification: {
                            icon: 'https://mikeyriverajr.github.io/PPAM-ENC/icon-512.png',
                            badge: 'https://mikeyriverajr.github.io/PPAM-ENC/badge.png', // Explicit monochrome icon for Android PWA status bar
                            click_action: 'https://mikeyriverajr.github.io/PPAM-ENC/beta.html'
                        }
                    }
                };
                
                promises.push(admin.messaging().send(message).then(()=> {
                    console.log(`[CEREBRO] ✅ ¡Push enviado con éxito!`);
                }).catch(err => {
                    console.error(`[CEREBRO] ❌ Error enviando a ${uid}:`, err);
                    
                    // Smart Cleanup: Delete the token if it expired or the user uninstalled the PWA
                    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
                         console.log(`[CEREBRO] Limpiando token inactivo de ${uid}`);
                         db.collection('publishers').doc(uid).update({ fcmToken: admin.firestore.FieldValue.delete() });
                    }
                }));
            } else {
                console.log(`[CEREBRO] ⚠️ El publicador ${pubData.firstName} no tiene el token activado.`);
            }

            if (pubData.emailNotificationsEnabled && pubData.notificationEmail) {
                console.log(`[CEREBRO] Enviando Email a: ${pubData.firstName} (${pubData.notificationEmail})`);
                promises.push(sendEmailNotification(pubData.notificationEmail, title, body));
            }
        }
    }
    return Promise.all(promises);
}

exports.updateShiftLocations = functions.firestore
    .document('locations/{locationId}')
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // Check if the name field actually changed
        if (beforeData.name === afterData.name) {
            return null;
        }

        console.log(`[CEREBRO] Ubicación ${context.params.locationId} cambió de nombre: ${beforeData.name} -> ${afterData.name}`);

        const db = admin.firestore();

        // Get today's date in YYYY-MM-DD
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        // Find all future shifts that belong to this location
        const shiftsRef = db.collection('shifts');
        const snapshot = await shiftsRef
            .where('locationId', '==', context.params.locationId)
            .where('date', '>=', todayStr)
            .get();

        if (snapshot.empty) {
            console.log(`[CEREBRO] No se encontraron turnos futuros para actualizar.`);
            return null;
        }

        console.log(`[CEREBRO] Actualizando ${snapshot.size} turnos con el nuevo nombre.`);

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { location: afterData.name });
        });

        await batch.commit();
        console.log(`[CEREBRO] ✅ Nombres de ubicación actualizados en todos los turnos futuros.`);
        return null;
    });

exports.sendDailyReminders = onSchedule({
    schedule: "0 8 * * *",
    timeZone: "America/Asuncion",
    timeoutSeconds: 300 // 5 minutes just in case
}, async (event) => {
    const db = admin.firestore();

    // 1. Calculate Tomorrow's Date in Asuncion Timezone
    // We want the literal YYYY-MM-DD string for tomorrow
    const now = new Date();
    // Use Intl.DateTimeFormat to get the parts in the specific timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Asuncion',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    // Add 24 hours to 'now' to get tomorrow
    now.setDate(now.getDate() + 1);
    const tomorrowStr = formatter.format(now); // en-CA format is YYYY-MM-DD naturally

    console.log(`[CEREBRO] Ejecutando recordatorios para el día: ${tomorrowStr}`);

    // 2. Query Shifts for Tomorrow
    const shiftsRef = db.collection('shifts');
    const snapshot = await shiftsRef.where('date', '==', tomorrowStr).get();

    if (snapshot.empty) {
        console.log('[CEREBRO] No hay turnos programados para mañana.');
        return null;
    }

    console.log(`[CEREBRO] Encontrados ${snapshot.size} turnos para mañana.`);

    const emailPromises = [];
    const pushPromises = [];

    // Configure Email Transporter
    const gmailEmail = process.env.GMAIL_EMAIL;
    const gmailPassword = process.env.GMAIL_PASSWORD;
    let transporter = null;
    if (gmailEmail && gmailPassword) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailEmail,
                pass: gmailPassword
            }
        });
    } else {
        console.log("[CEREBRO] ⚠️ Credenciales de Gmail no configuradas en variables de entorno. Omitiendo recordatorios por email.");
    }

    for (const doc of snapshot.docs) {
        const shiftData = doc.data();
        const participants = shiftData.participants || [];

        for (const uid of participants) {
            if (!uid || uid === "Disponible") continue;

            // Fetch User
            const userDoc = await db.collection('publishers').doc(uid).get();
            if (!userDoc.exists) continue;

            const userData = userDoc.data();
            const locationName = shiftData.location || 'Local';
            const timeSlot = shiftData.time || '--:-- a --:--';

            const title = "Recordatorio de Turno";
            const body = `Hola ${userData.firstName}, recuerda que tienes un turno mañana en ${locationName} de ${timeSlot}.`;

            // 1. Push Notification
            if (userData.fcmToken) {
                const message = {
                    notification: { title, body },
                    token: userData.fcmToken,
                    webpush: {
                        notification: {
                            icon: 'https://mikeyriverajr.github.io/PPAM-ENC/icon-512.png',
                            badge: 'https://mikeyriverajr.github.io/PPAM-ENC/badge.png',
                            click_action: 'https://mikeyriverajr.github.io/PPAM-ENC/beta.html'
                        }
                    }
                };
                pushPromises.push(
                    admin.messaging().send(message).catch(err => {
                        console.error(`[CEREBRO] ❌ Error enviando Push recordatorio a ${uid}:`, err);
                        // Clean up inactive tokens
                        if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
                             db.collection('publishers').doc(uid).update({ fcmToken: admin.firestore.FieldValue.delete() });
                        }
                    })
                );
            }

            // 2. Email Notification
            if (transporter && userData.emailNotificationsEnabled && userData.notificationEmail) {
                const emailHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; border-radius: 5px;">
                  <h2 style="color: #333;">📅 Recordatorio de Turno</h2>
                  <p>Hola <strong>${userData.firstName}</strong>,</p>
                  <p>Este es un recordatorio de que tienes un turno programado para mañana.</p>
                  <table style="width: 100%; max-width: 400px; margin-top: 20px; border-collapse: collapse; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                    <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Ubicación:</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">${locationName}</td></tr>
                    <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Horario:</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">${timeSlot}</td></tr>
                    <tr><td style="padding: 10px;"><strong>Fecha:</strong></td><td style="padding: 10px;">Mañana (${tomorrowStr})</td></tr>
                  </table>
                  <p style="margin-top: 20px;">
                    <a href="https://mikeyriverajr.github.io/PPAM-ENC/beta.html" style="background-color: #5d7aa9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Abrir Aplicación</a>
                  </p>
                </div>
                `;

                const mailOptions = {
                    from: `"PPAM Encarnación" <${gmailEmail || 'no-reply@ppam.com'}>`,
                    to: userData.notificationEmail,
                    subject: "Recordatorio de Turno (Mañana)",
                    html: emailHtml
                };

                emailPromises.push(
                    transporter.sendMail(mailOptions).catch(err => {
                        console.error(`[CEREBRO] ❌ Error enviando Email recordatorio a ${uid}:`, err);
                    })
                );
            }
        }
    }

    await Promise.all([...pushPromises, ...emailPromises]);
    console.log(`[CEREBRO] ✅ Recordatorios procesados. Push: ${pushPromises.length}, Emails: ${emailPromises.length}`);
    return null;
});

// Securely delete a user's Firebase Auth account.
// This must be a callable function so the Admin frontend can trigger it.
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    // 1. Verify Authentication & Authorization
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // We must verify the caller is an admin.
    const db = admin.firestore();
    const callerRef = db.collection('users').doc(context.auth.uid);
    const callerDoc = await callerRef.get();

    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
         throw new functions.https.HttpsError('permission-denied', 'Only administrators can delete user accounts.');
    }

    // 2. Validate input
    const targetUid = data.uid;
    if (!targetUid || typeof targetUid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a valid target uid.');
    }

    try {
        // 3. Delete from Firebase Auth
        await admin.auth().deleteUser(targetUid);
        console.log(`[CEREBRO] ✅ Usuario de Auth eliminado con éxito: ${targetUid} (Solicitado por admin ${context.auth.uid})`);
        return { success: true, message: 'Usuario eliminado del sistema de autenticación.' };
    } catch (error) {
        console.error(`[CEREBRO] ❌ Error eliminando usuario de Auth ${targetUid}:`, error);

        // If the user was already deleted from Auth, treat it as a success for idempotency
        if (error.code === 'auth/user-not-found') {
             console.log(`[CEREBRO] ⚠️ El usuario ${targetUid} ya no existía en Auth. Continuando...`);
             return { success: true, message: 'El usuario ya no existía en el sistema de autenticación.' };
        }

        throw new functions.https.HttpsError('internal', 'No se pudo eliminar la cuenta de autenticación: ' + error.message);
    }
});
