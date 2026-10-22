# New Publisher Features Plan: Profile Pictures, Partner WhatsApp, Calendar, Weather & Personal History

This plan adds five enhancements to the publisher experience—focused on **Mis Turnos** and **Perfil**—along with profile photo support in the Admin **Directorio**.

---

## Where & How Profile Pictures Are Stored

> [!IMPORTANT]
> **Storage Location & Size:**
> - **Where it is saved**: Directly in your existing **Firestore Database** inside each publisher's document (`publishers/{publisherId}` under the field `photoUrl`), with automatic support for **Firebase Cloud Storage** (`ppam-beta.firebasestorage.app/avatars/{publisherId}.jpg`) if Storage permissions allow it.
> - **How it stays tiny & fast**:
>   - When a publisher selects a photo from their phone (even a 5 MB camera photo), the app uses an on-device HTML5 `<canvas>` to center-crop and compress it down to **`160×160` pixels (JPEG at 75% quality)** before saving.
>   - Each compressed profile picture is only **~8 KB to 12 KB**.
>   - Even if **100 publishers** upload a photo, the total space used is **~1 MB** (only **0.1%** of Firestore's free 1 GB limit).
> - **Why this prevents permission errors**:
>   - Publishers already have write permission on their own `publishers/{publisherId}` document, so saving `photoUrl` works immediately without changing any Firebase Console rules.

---

## 1. Feature Breakdown & User Experience

### A. Participant Profile Pictures (`Perfil`, `Mis Turnos`, and Admin `Directorio`)
1. **Uploading in `Perfil` (`index.html` / `app.js`)**:
   - Adds a **Mi Foto de Perfil** section at the top of **Perfil** showing the user's circular avatar (or initials badge if none is set), with **"📷 Subir / Cambiar Foto"** and **"Eliminar Foto"** buttons.
   - Automatically center-crops and compresses the chosen photo on-device to `160×160` (~10 KB) and saves it to `publishers/{publisherId}.photoUrl`.
2. **Displaying Partner Photos on `Mis Turnos` Only**:
   - On **Mis Turnos** shift cards, each partner is displayed with their circular profile picture (or a clean initials badge if they haven't uploaded one yet). Tapping a partner's photo opens a larger preview so you can easily recognize them at the shift location.
   - Other tabs (**Turnos Libres** and **Programa General**) remain text-only as requested.
3. **Admin `Directorio` Support (`admin.html` / `app-admin.js`)**:
   - Displays publisher avatars in the **Directorio** list and **Ver Publicador** modal, and allows admins to upload or remove a publisher's photo when editing their profile.

### B. WhatsApp Button for Shift Partners (On `Mis Turnos` Cards Only)
- Next to each partner's photo and name on **Mis Turnos** cards, if the partner has a phone number registered, a green **WhatsApp** button appears.
- Tapping it opens WhatsApp (`https://wa.me/...`) with a friendly pre-filled message:
  > *"Hola [Nombre], te escribo por nuestro turno de PPAM el [Fecha] ([Horario]) en [Ubicación]."*

### C. Encarnación Weather Forecast Badge on Upcoming Shifts (`Mis Turnos`)
- Queries the free **Open-Meteo API** for Encarnación, Paraguay (`lat: -27.3306, lon: -55.8667`, timezone `America/Asuncion`) with no API key required.
- For any upcoming shift in **Mis Turnos** within the next 7 days, displays a compact weather badge (e.g., `☀️ 28°C • 💧 10%` or `🌧️ 22°C • 💧 80%`) matched to the specific date and hours of that shift.

### D. "Agendar en mi Calendario" Button (`Mis Turnos`)
- Each upcoming shift card in **Mis Turnos** includes an **"📅 Agendar en Calendario"** button:
  - **Google Calendar**: Opens a pre-filled Google Calendar event tab for Android/Web users.
  - **Calendario del Celular (.ics)**: Downloads a standard `.ics` calendar file with a 1-hour reminder alarm for iPhone/Apple Calendar and native calendar apps.

### E. Personal Shift History Section (`Mis Turnos`)
- At the bottom of **Mis Turnos**, adds a collapsible **"📜 Mi Historial de Turnos"** section:
  - Shows personal summary badges: **Turnos Completados** and **Mis Interacciones Reportadas**.
  - Lists all past shifts the publisher completed (most recent first), including their partner(s), location, date, and any **Informe de Turno** they submitted (with the option to complete or edit a report).

---

## 2. Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Publisher App (index.html / app.js)               │
├─────────────────────────────────────────────────────────────────────────┤
│ • Tab "Perfil"                                                          │
│   └── Photo Picker -> Canvas 160x160 Crop -> publishers/{id}.photoUrl   │
│                                                                         │
│ • Tab "Mis Turnos"                                                      │
│   ├── Upcoming Shift Cards                                              │
│   │   ├── Weather Badge (Open-Meteo hourly forecast for Encarnación)    │
│   │   ├── Partner Row: [Avatar] Partner Name + [WhatsApp Chat Button]   │
│   │   └── Actions: [📅 Agendar en Calendario]  [Cancelar Turno]         │
│   ├── Recent Finished Shifts (Last 14 Days)                             │
│   │   └── Partner Avatar + [Completar / Editar Informe de Turno]        │
│   └── Collapsible "📜 Mi Historial de Turnos"                           │
│       └── Personal KPIs (Turnos / Interacciones) + Past Shifts List     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Files to Modify
- **`index.html`**:
  - Add avatar upload UI in **Perfil**, partner avatar & WhatsApp styles, calendar choice modal, photo lightbox modal, and the collapsible **Mi Historial de Turnos** container in **Mis Turnos**.
- **`app.js`**:
  - Load `photoUrl` into `publisherCache`, implement client-side image compression and upload, render partner avatars and WhatsApp links on **Mis Turnos**, fetch Open-Meteo forecast for Encarnación, generate Google Calendar / `.ics` events, and render **Mi Historial de Turnos**.
- **`admin.html` & `app-admin.js`**:
  - Show publisher avatars in **Directorio** and **Ver Publicador**, and allow admins to upload/remove a publisher's photo in **Editar Publicador**.
- **`service-worker.js`**:
  - Bump cache version so all devices automatically load the new features.
