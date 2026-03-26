const functions = require('firebase-functions/v1');
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
            names.push(doc.data().firstName || 'Un publicador');
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
    const gmailEmail = process.env.GMAIL_EMAIL || functions.config().gmail?.email;
    const gmailPassword = process.env.GMAIL_PASSWORD || functions.config().gmail?.password;

    if (!gmailEmail || !gmailPassword) {
        console.log("[CEREBRO] ⚠️ Credenciales de Gmail no configuradas. Omitiendo email.");
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
                const message = { notification: { title: title, body: body }, token: token };
                
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
