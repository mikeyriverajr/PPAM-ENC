# Fix Firestore Permissions Error for "Informe de Turno" & Cancellations

This plan resolves the `Missing or insufficient permissions` error by saving shift reports (`shiftReports`) and cancellation logs (`cancellationHistory`) inside each publisher's own `publishers/{publisherId}` document—where publishers already have write access—and keeping `shifts/{shiftId}` updates strictly limited to `participants`.

## 1. Root Cause Analysis
- Your live Firestore Security Rules for `shifts/{shiftId}` only allow non-admin users to modify the `participants` array (when claiming or canceling a shift).
- Writing `reports.{publisherId}` or `cancelledParticipants` to `shifts/{shiftId}` is rejected by Firestore Security Rules for non-admin users.
- In contrast, logged-in publishers already have full write permission on their own `publishers/{publisherId}` document.

---

## 2. Planned Changes

### A. Publisher App (`app.js` / `index.html`)
1. **Save Shift Reports on `publishers/{currentUserPublisherId}` (`saveShiftReport`)**:
   - Save reports under `shiftReports` on `db.collection('publishers').doc(currentUserPublisherId)` keyed by `shiftId`:
     ```javascript
     {
       shiftId,
       date: shift.date,
       time: shift.time,
       location: shift.location,
       partnerText,
       publisherId: currentUserPublisherId,
       publisherName,
       interactions,
       comments,
       updatedAt: new Date().toISOString()
     }
     ```
   - Update `currentPubData.shiftReports` in memory immediately so `loadMyShifts()` shows the green **Informe enviado** state right away.
2. **Read Reports from `currentPubData.shiftReports` (`loadMyShifts` & `openShiftReportModal`)**:
   - Check `currentPubData?.shiftReports?.[shift.id]` (with fallback to `shift.reports?.[currentUserPublisherId]`) when determining whether a finished shift has a report submitted and when pre-filling the modal for editing.
3. **Keep `shifts/{shiftId}` Cancellation Updates Strictly to `participants` (`attemptCancel`)**:
   - Update `shifts/{shiftId}` with **only** `{ participants: currentParticipants }` so Firestore Security Rules never reject a shift cancellation.
   - Continue saving `lastCancelledShift`, `cancelledCount`, and `cancellationHistory` on `publishers/{currentUserPublisherId}`.

### B. Admin Panel (`app-admin.js` / `admin.html`)
1. **Admin "Informes" Tab (`loadShiftReports` & `renderShiftReports`)**:
   - Refresh `allPublishers` alongside `shifts` and collect all submitted reports from `pub.shiftReports` across every publisher (plus any `shift.reports` if present).
   - Match reports to shifts to compute KPIs (**Informes Recibidos**, **Total de Interacciones**, **Experiencias / Comentarios**) and identify finished shifts that still have no report submitted.
2. **Admin Publisher History Modal (`loadPublisherShiftHistory`)**:
   - Read the publisher's interaction counts and comments directly from `pub.shiftReports?.[shift.id]` (with fallback to `shift.reports?.[pub.id]`).
