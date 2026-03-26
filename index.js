const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
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

async function notifyUsers(userIds, title, body) {
    if (!userIds || userIds.length === 0) return null;
    const db = admin.firestore();
    const promises = [];

    for (const uid of userIds) {
        const pubDoc = await db.collection('publishers').doc(uid).get();
        if (pubDoc.exists) {
            const token = pubDoc.data().fcmToken;
            if (token) {
                console.log(`[CEREBRO] Enviando Push a: ${pubDoc.data().firstName}`);
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
                console.log(`[CEREBRO] ⚠️ El publicador ${pubDoc.data().firstName} no tiene el token activado.`);
            }
        }
    }
    return Promise.all(promises);
}
