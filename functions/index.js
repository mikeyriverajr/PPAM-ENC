const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// --- 1. Admin Tools (2nd Gen) ---

/**
 * resetUserPassword
 * Allows an admin to reset the password for any user.
 * Input: { uid: string, newPassword: string }
 */
exports.resetUserPassword = onCall(async (request) => {
    // 1. Security Check: Caller must be an Admin
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const callerUid = request.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();
    
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'No tienes permisos de administrador.');
    }

    const { uid, newPassword } = request.data;
    if (!uid || !newPassword) {
        throw new HttpsError('invalid-argument', 'Faltan datos (uid o contraseña).');
    }

    try {
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        return { success: true, message: "Contraseña actualizada correctamente." };
    } catch (error) {
        console.error("Error resetting password:", error);
        throw new HttpsError('internal', error.message);
    }
});


// --- 2. Notification Logic (2nd Gen) ---

/**
 * onShiftChange
 * Triggers when a shift document is written (created or updated).
 * Detects if a user took a shift or cancelled, and sends notifications.
 */
exports.onShiftChange = onDocumentUpdated('shifts/{shiftId}', async (event) => {
        const newData = event.data.after.data();
        const oldData = event.data.before.data();

        if (!newData || !oldData) return; // Safety check

        const newParticipants = newData.participants || [];
        const oldParticipants = oldData.participants || [];

        // 1. Detect New Assignments (someone added)
        const addedUsers = newParticipants.filter(p => !oldParticipants.includes(p));
        
        // 2. Detect Cancellations (someone removed)
        const removedUsers = oldParticipants.filter(p => !newParticipants.includes(p));

        if (addedUsers.length === 0 && removedUsers.length === 0) return;

        // Helper to find UID by linkedName
        const allUserDocs = await db.collection('users').get();
        const nameToUidMap = {};
        allUserDocs.forEach(doc => {
            const d = doc.data();
            if (d.linkedName) nameToUidMap[d.linkedName] = doc.id;
        });

        const batch = db.batch();

        // Notify Added Users
        addedUsers.forEach(name => {
            if (name.toLowerCase().includes('disponible')) return;

            const uid = nameToUidMap[name];
            if (uid) {
                const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
                batch.set(notifRef, {
                    title: "¡Turno Asignado!",
                    body: `Se te ha asignado el turno: ${newData.date} - ${newData.time} en ${newData.location}.`,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'assignment',
                    shiftId: event.params.shiftId
                });
            }
        });
        
        // Notify Removed Users
        removedUsers.forEach(name => {
             if (name.toLowerCase().includes('disponible')) return;
             
             const uid = nameToUidMap[name];
             if (uid) {
                const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
                batch.set(notifRef, {
                    title: "Turno Cancelado",
                    body: `Has sido removido del turno: ${oldData.date} - ${oldData.time}.`,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'cancellation',
                    shiftId: event.params.shiftId
                });
             }
        });

        return batch.commit();
    });

/**
 * onSchedulePublished
 * Triggered when a new Day is created.
 */
exports.onSchedulePublished = onDocumentCreated('days/{dayId}', (event) => {
    // Logic to notify everyone can go here
    return null;
});
