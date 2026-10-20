# Multi-Pair Location Availability: Analysis & Implementation Plan

This document explains why the `Ex-Hospital Regional 1` / `Ex-Hospital Regional 2` availability dilemma happens in the current architecture and proposes a zero-friction solution that works immediately with your existing locations and publishers.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Why You Currently Need Two Locations (`... 1` and `... 2`)**:
> If you set a single location to `Capacidad: 4`, the app creates a single 4-person shift (`[Pub1, Pub2, Pub3, Pub4]`). In **Mis Turnos**, everyone sees all 3 other names together (`Con: Pub2, Pub3, Pub4`) without knowing who is paired with whom, and any cancellation notifies all 3 people.
>
> Having two 2-person shifts (`Ex-Hospital Regional 1` and `Ex-Hospital Regional 2`) is actually the **best way** to keep the two pairs separate on the schedule—the only problem is that **Mi Horario** treats them as two unrelated locations!

- **Recommended Solution (Unified Availability for Numbered Locations)**:
  1. **In the Generator & Admin Disponibilidad Tab (`app-admin.js`)**: Automatically link locations that share the same base name (e.g., `Ex-Hospital Regional 1` and `Ex-Hospital Regional 2` → base name `Ex-Hospital Regional`) at the same day and time. If a publisher checked *either* `Ex-Hospital Regional 1` *or* `Ex-Hospital Regional 2` on Wednesday at 10:00, the generator automatically considers them available for **both** shifts (while still never assigning the same person to both at once).
  2. **In the Publisher's "Mi Horario" Tab (`app.js`)**: Merge sibling numbered locations (`Ex-Hospital Regional 1` and `Ex-Hospital Regional 2`) that have the same day and time into **one single checkbox** (`Ex-Hospital Regional (10:00 - 12:00)`). When the publisher checks that single box and saves, it automatically saves both location keys behind the scenes.

---

## 1. Overview & How the Recommendation Works

### Why This Solves the Dilemma Immediately
1. **No Publisher Action Needed**: Even before publishers open the app again, the generator will treat anyone who selected `Ex-Hospital Regional 1` (or `2`) on Wednesday at 10:00 AM as available for **both** `Ex-Hospital Regional 1` and `Ex-Hospital Regional 2`.
2. **Simpler "Mi Horario" Screen for Publishers**: When publishers go to **Mi Horario**, they will no longer see duplicate checkboxes like:
   - `Ex-Hospital Regional 1 (10:00 - 12:00)`
   - `Ex-Hospital Regional 2 (10:00 - 12:00)`
   Instead, they will see a single unified checkbox:
   - `Ex-Hospital Regional (10:00 - 12:00)`
   Checking that one box checks all matching numbered sub-locations for that day and time.
3. **Preserves Pair Separation on the Calendar**:
   - In the Admin Generator and the live calendar, `Ex-Hospital Regional 1` and `Ex-Hospital Regional 2` remain two separate 2-person shifts.
   - You keep 100% control over which pair works together in Shift 1 vs. Shift 2.
   - Each publisher in **Mis Turnos** only sees their actual 1 partner (`Con: ...`), and push/email notifications only go to their partner.

---

## 2. User Experience & Visual Design

### Publisher View (`index.html` / `app.js` — "Mi Horario")
- **Unified Checkbox Display**:
  - Locations whose names only differ by a trailing number (e.g., `Ex-Hospital Regional 1`, `Ex-Hospital Regional 2`, or `Costanera #1`, `Costanera #2`) and share the same `day` and `startTime - endTime` are grouped into one row labeled with the clean base name (`Ex-Hospital Regional (10:00 - 12:00)`).
  - If the publisher previously had *either* `1` or `2` checked, the unified checkbox appears **checked**.
  - When they click **Guardar Horario**, the app writes both `loc1Id_day_startTime` and `loc2Id_day_startTime` into their `availability` array in Firestore.

### Admin View (`admin.html` / `app-admin.js`)
- **Generator (`generateDraft`)**:
  - Automatically builds a shared availability group for any locations that share the same normalized base name + day + start time.
  - A publisher who has *any* of those sibling keys in their `availability` is eligible for all sibling shifts at that time (and once assigned to `Ex-Hospital Regional 1` on that day, `canAssign()` naturally prevents them from also being assigned to `Ex-Hospital Regional 2` on the same day).
- **Manual Shift Edit Modal (`openShiftEditModal`) & Consultar Disponibilidad Tab (`checkAvailability`)**:
  - Also uses the shared sibling availability check so when you manually edit `Ex-Hospital Regional 2` or check availability in Tab 4, publishers who only checked `Ex-Hospital Regional 1` appear under `✅ Disponibles (Aprobados)` instead of `❌ No Disponibles`!
- **Admin Publisher Edit Modal (`buildAdminAvailabilityForm`)**:
  - Also groups sibling numbered locations into a single checkbox so admins editing a publisher's availability don't have to check both `1` and `2` manually either.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Automatic Base-Name Grouping (`getBaseLocationName`) vs. Restructuring Database**
  - *Chosen Approach*: Normalize location names by stripping trailing numbers/markers (e.g. `"Ex-Hospital Regional 1"` → `"Ex-Hospital Regional"`) to detect sibling locations at the same day & time.
  - *Why*: Requires zero database migration, works immediately with your existing `Ex-Hospital Regional 1` and `Ex-Hospital Regional 2` locations, and automatically works for any future numbered locations you create (e.g., `Plaza 1` & `Plaza 2`).

---

## 4. Technical Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│             Sibling Location Grouping (getBaseLocationName)             │
│   "Ex-Hospital Regional 1" ─┐                                           │
│                             ├──► Base Name: "Ex-Hospital Regional"      │
│   "Ex-Hospital Regional 2" ─┘    Same Day + Same Time (Mié 10:00-12:00) │
└─────────────────────────────────────────────────────────────────────────┘
                   │                                     │
                   ▼                                     ▼
┌────────────────────────────────────┐ ┌──────────────────────────────────┐
│   Publisher App ("Mi Horario")     │ │   Admin Generator & Edit Modal   │
├────────────────────────────────────┤ ├──────────────────────────────────┤
│ • Shows 1 unified checkbox:        │ │ • Treats availability in ANY     │
│   "Ex-Hospital Regional (10-12)"   │ │   sibling location at that day & │
│ • Checked if user has loc1 OR loc2 │ │   time as valid for BOTH shifts  │
│ • Saving writes BOTH loc1 & loc2   │ │ • Prevents assigning the same    │
│   keys to Firestore availability[] │ │   person to both simultaneously  │
└────────────────────────────────────┘ └──────────────────────────────────┘
```
