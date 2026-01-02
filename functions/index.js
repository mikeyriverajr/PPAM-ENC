const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// --- 1. Admin Tools ---

/**
 * resetUserPassword
 * Allows an admin to reset the password for any user.
 * Input: { uid: string, newPassword: string }
 */
exports.resetUserPassword = functions.https.onCall(async (data, context) => {
    // 1. Security Check: Caller must be an Admin
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const callerUid = context.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();

    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'No tienes permisos de administrador.');
    }

    const { uid, newPassword } = data;
    if (!uid || !newPassword) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan datos (uid o contraseña).');
    }

    try {
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        return { success: true, message: "Contraseña actualizada correctamente." };
    } catch (error) {
        console.error("Error resetting password:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});


// --- 2. Notification Logic ---

/**
 * onShiftChange
 * Triggers when a shift document is written (created or updated).
 * Detects if a user took a shift or cancelled, and sends notifications.
 */
exports.onShiftChange = functions.firestore
    .document('shifts/{shiftId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        const newParticipants = newData.participants || [];
        const oldParticipants = oldData.participants || [];

        // 1. Detect New Assignments (someone added)
        const addedUsers = newParticipants.filter(p => !oldParticipants.includes(p));

        // 2. Detect Cancellations (someone removed)
        const removedUsers = oldParticipants.filter(p => !newParticipants.includes(p));

        // Note: 'participants' array stores NAMES (linkedName), not UIDs.
        // We need to find the UID associated with that name to notify them.

        if (addedUsers.length === 0 && removedUsers.length === 0) return null;

        // Helper to find UID by linkedName
        // This is not efficient for large scale, but fine for this scale.
        // Better: Store {uid, name} in participants array in the future.
        const allUserDocs = await db.collection('users').get();
        const nameToUidMap = {};
        allUserDocs.forEach(doc => {
            const d = doc.data();
            if (d.linkedName) nameToUidMap[d.linkedName] = doc.id;
        });

        const batch = db.batch();

        // Notify Added Users
        addedUsers.forEach(name => {
            // Ignore "Disponible"
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
                    shiftId: context.params.shiftId
                });
            }
        });

        // Notify Removed Users (Cancellations)
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
                    shiftId: context.params.shiftId
                });
             }
        });

        return batch.commit();
    });

/**
 * onSchedulePublished
 * Triggered when a new Day is created (indicating a new schedule upload).
 * Just a placeholder for now.
 */
exports.onSchedulePublished = functions.firestore
    .document('days/{dayId}')
    .onCreate((snap, context) => {
        // Logic to notify everyone "New Schedule is Out!" could go here.
        return null;
    });
