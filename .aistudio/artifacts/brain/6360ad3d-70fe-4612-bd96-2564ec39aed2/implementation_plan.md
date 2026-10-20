# Informe de Turno & Publisher Shift History Plan

This plan adds post-shift reporting (**Informe de Turno**) for publishers once their shift finishes, tracks detailed cancellation history, and gives administrators both a dedicated **Informes** tab and a per-publisher **Shift & Cancellation History** view in the Directory.

## User Review & Critical Decisions

> [!IMPORTANT]
> **How Past Cancellations Are Handled:**
> - **What your database currently has**: Previously, `attemptCancel()` in `app.js` only saved a single field—`lastCancelledShift` (the date/time of the most recent cancellation)—and overwrote it each time without incrementing a counter or saving which shift was cancelled.
> - **What will be included automatically**:
>   1. Any publisher who has a `lastCancelledShift` timestamp in Firestore will automatically start with **1 cancellation** recorded in their history (showing the exact date & time from `lastCancelledShift`) instead of `0`.
>   2. If a publisher cancelled *multiple* times in the past, Firestore only kept the last timestamp because the old code overwrote it. From this update forward, **every** cancellation will be permanently counted and logged with the shift's date, time, location, and cancellation timestamp.

- **Zero-Config Compatibility with Live Firestore Rules & Cloud Functions**:
  - Shift reports are stored inside `shifts/{shiftId}` (`reports.{publisherId}`) and cancellation logs inside `publishers/{id}` (`cancelledCount` + `cancellationHistory`), working immediately with your existing Firestore Security Rules without triggering unwanted push/email notifications.

---

## 1. Overview & User Flows

### A. Publisher Flow: Filling Out the "Informe de Turno" (`index.html` / `app.js`)
1. **Detecting Finished Shifts**:
   - In `loadMyShifts()`, the app checks the publisher's assigned shifts:
     - **Upcoming Shifts**: Shifts in the future (or today before `endTime`) show the normal shift card with **Cancelar Turno**.
     - **Finished Shifts (Last 14 Days)**: Once `${shift.date} ${endTime}` has passed, the shift card transitions from "Cancelar Turno" to **"📋 Completar Informe de Turno"** (or **"✅ Informe Enviado — Ver / Editar"** if already submitted).
   - If the publisher has at least one finished shift from the last 14 days with no report submitted yet, a prominent alert banner at the top of **Mis Turnos** prompts them to submit their report.
2. **Informe de Turno Modal**:
   - Displays the shift's **Fecha**, **Ubicación**, **Horario**, and **Compañero(a)**.
   - **¿Cuántas interacciones tuvieron?** (Numeric input, `0` or more).
   - **Comentarios o experiencias positivas** (Textarea for sharing experiences, observations, or incidents).
   - **Guardar Informe** button saves the report to `shifts/{shiftId}` under `reports.{publisherId}` (recording `publisherId`, `publisherName`, `interactions`, `comments`, `updatedAt`).

### B. Cancellation Tracking (`app.js`)
- When a publisher cancels a shift via `attemptCancel()`:
  - Calculates the base count (`pub.cancelledCount` if present, or `1` if `pub.lastCancelledShift` already existed, else `0`) and increments it by `1`.
  - Appends `{ shiftId, date, time, location, cancelledAt }` to `cancellationHistory` on their `publishers/{id}` document (and if they had a legacy `lastCancelledShift` not yet in `cancellationHistory`, preserves it as the first entry so it is never lost).
  - Also records `{ publisherId, cancelledAt }` in `cancelledParticipants` on the `shifts/{shiftId}` document so shift history retains cancelled shifts even after the user is removed from `participants`.

### C. Admin Flow 1: Publisher Shift & Cancellation History (`admin.html` / `app-admin.js`)
- When an admin clicks a publisher in **Directorio** (`viewPublisher(id)`):
  - **Summary Badges**:
    - **Turnos Asignados**: Count of completed + upcoming shifts in the database.
    - **Cancelaciones**: Total cancellation count (automatically includes `1` for any existing `lastCancelledShift` plus all newly tracked cancellations).
    - **Interacciones Reportadas**: Sum of interactions from reports they submitted.
  - **Historial de Turnos y Cancelaciones Section**:
    - Lists the publisher's shifts (most recent first) showing Date, Location, Time, Partner(s), and status badge (`Próximo`, `Completado`, or `Cancelado`), plus any submitted interaction count and comment.
    - Lists all recorded cancellation events (including the legacy `lastCancelledShift` date/time if present).

### D. Admin Flow 2: Congregation-Wide "Informes" Tab (`admin.html` / `app-admin.js`)
- Adds a 5th tab in the Admin navigation bar: **`📋 Informes`**.
- **Top Summary Cards**:
  - **Informes Recibidos** (count of submitted shift reports)
  - **Total de Interacciones** (sum of interactions across filtered reports)
  - **Experiencias / Comentarios** (count of reports with written comments)
- **Filters & Feed**:
  - Filter by **Mes** and search by **Publicador, Ubicación o Comentario**.
  - Displays each report card with Date, Location, Time, Publisher name, Partner name, an **Interacciones** badge, and the full text of their comment or positive experience.

---

## 2. Technical Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Publisher App (index.html / app.js)                  │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. Shift Finishes (Date + EndTime <= Now)                               │
│    └── "Mis Turnos" shows pending report banner & "Completar Informe"   │
│                                                                         │
│ 2. Submit Informe Modal                                                 │
│    ├── Inputs: Interactions (number) + Comments/Experiences (textarea)  │
│    └── Saves to shifts/{shiftId}.reports[publisherId]                   │
│                                                                         │
│ 3. Cancel Shift (attemptCancel)                                         │
│    ├── Preserves existing lastCancelledShift as 1st history entry       │
│    ├── Removes UID from shifts/{shiftId}.participants                   │
│    ├── Adds entry to shifts/{shiftId}.cancelledParticipants[]           │
│    └── Increments publishers/{id}.cancelledCount & cancellationHistory[]│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Admin Panel (admin.html / app-admin.js)               │
├─────────────────────────────────────────────────────────────────────────┤
│ • Directorio -> Ver Publicador Modal (#pub-view-modal)                  │
│   ├── Summary Counters: Turnos | Cancelaciones | Interacciones          │
│   └── Chronological Shift & Cancellation History for that Publisher     │
│                                                                         │
│ • New "Informes" Tab (#tab-reports)                                     │
│   ├── Congregation KPIs: Total Reports, Interactions, Experiences       │
│   └── Searchable / Month-filtered feed of all Informes de Turno         │
└─────────────────────────────────────────────────────────────────────────┘
```
