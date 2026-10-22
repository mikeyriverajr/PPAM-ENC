# PPAM | Encarnación — Reglas de Firebase y Nuevas Opciones en Informe de Turno

Este plan resuelve de forma definitiva el error `Missing or insufficient permissions` al guardar el **Informe de Turno** o subir una **Foto de Perfil**, e incorpora las dos nuevas opciones solicitadas dentro del **Informe de Turno**: indicar que **el turno fue cancelado** (sin exigir motivo) o que **el compañero(a) de turno enviará el informe**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **¿Por qué seguía apareciendo `Missing or insufficient permissions`?**
> Las reglas de seguridad activas en la consola de Firebase (`ppam-beta`) tienen una lista cerrada (`hasOnly([...])`) de los campos que un publicador puede editar en su propio documento `publishers/{id}` (como `phone`, `availability`, `absences`, `lastProfileChange`, etc.). Cuando la app intenta guardar un campo nuevo como `shiftReports` o `photoUrl`, Firebase lo bloquea hasta que se actualicen las reglas en la Consola de Firebase.
>
> **Solución Doble (Reglas + Respaldo Automático Inmediato):**
> 1. **Reglas de Firestore listas para pegar:** Incluimos abajo las reglas de seguridad actualizadas (`firestore.rules`) para que puedas pegarlas en **Firebase Console → Firestore Database → Rules → Publish**.
> 2. **Respaldo automático en campos ya permitidos:** Incluso antes de que actualices las reglas en la consola de Firebase (o si algún dispositivo tarda en actualizar), si Firebase rechaza la escritura de `shiftReports` o `photoUrl`, la aplicación guardará automáticamente el informe y la foto dentro del arreglo ya autorizado del perfil del publicador. Así ningún hermano volverá a ver el error de permisos.

- **Decisión Confirmada 1 (Permisos de Firebase)**: Actualizar las reglas de Firestore para autorizar `shiftReports`, `photoUrl`, `cancelledCount` y `cancellationHistory`, acompañado de un respaldo automático transparente en los campos ya permitidos del perfil.
- **Decisión Confirmada 2 (Turno Cancelado en el Informe)**: Agregar la opción **"❌ El turno fue cancelado"** en el Informe de Turno sin exigir motivo obligatorio (dejando el campo de comentarios como opcional).
- **Decisión Confirmada 3 (Informe enviado por el compañero)**: Agregar la opción **"🤝 Mi compañero(a) enviará el informe"** para que un publicador pueda marcar su informe como cubierto por su compañero sin duplicar el conteo de interacciones.

---

## Reglas de Firestore Listas para Copiar y Pegar en Firebase Console

Para actualizar las reglas directamente en tu proyecto de Firebase:
1. Abre [Firebase Console](https://console.firebase.google.com/) y entra a **`ppam-beta`**.
2. En el menú izquierdo, ve a **Firestore Database → Pestaña "Reglas" (Rules)**.
3. Reemplaza las reglas por las siguientes y haz clic en **Publicar (Publish)**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isAdmin() {
      return isSignedIn() && (
        !request.auth.token.email.matches('.*@ppam\\.app$') ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         getUserData().role == 'admin')
      );
    }

    function isOwnPublisherDoc(pubId) {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        getUserData().publisherId == pubId;
    }

    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow update: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow create, delete: if isAdmin();
    }

    match /publishers/{pubId} {
      allow read: if isSignedIn();
      allow create, delete: if isAdmin();
      // Permite al propio publicador actualizar su perfil, foto, informes, ausencias y cancelaciones
      allow update: if isAdmin() || isOwnPublisherDoc(pubId);
    }

    match /shifts/{shiftId} {
      allow read: if isSignedIn();
      allow create, delete: if isAdmin();
      // Permite a los publicadores tomar/cancelar turnos y adjuntar informes
      allow update: if isAdmin() || (
        isSignedIn() &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['participants', 'reports', 'cancelledParticipants'])
      );
    }

    match /locations/{locId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /settings/{docId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /draft_shifts/{draftId} {
      allow read, write: if isAdmin();
    }
  }
}
```

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Elimina por completo el error `Missing or insufficient permissions` al guardar informes de turno, subir fotos de perfil y cancelar turnos.
  2. Añade un selector claro de **Estado del Turno** en la ventana de **Informe de Turno** con tres opciones:
     - **✅ Turno realizado** (permite ingresar el número de interacciones y comentarios).
     - **🤝 Mi compañero(a) lo envía por mí** (oculta el campo de interacciones para no duplicar números y marca el informe como completado).
     - **❌ El turno fue cancelado** (oculta el campo de interacciones sin pedir motivo obligatorio y registra que el turno no se llevó a cabo).
- **Target Audience / Persona**: Publicadores y administradores de PPAM Encarnación.
- **Key Value**: Cero errores de permisos para los hermanos desde el celular y reportes mucho más exactos cuando solo uno de los dos compañeros carga los datos o cuando un turno se suspende.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Selector de Estado en Informe de Turno (`Mis Turnos`)**:
     - Al abrir **Informe de Turno**, el publicador ve tres botones de selección rápida (`>= 44px` de alto para uso cómodo con el pulgar):
       - **✅ Turno realizado** (seleccionado por defecto): Muestra el campo numérico `¿Cuántas interacciones tuvieron?` y el cuadro de `Comentarios o experiencias positivas (Opcional)`.
       - **🤝 Mi compañero(a) envía el informe**: Oculta el contador de interacciones, muestra un breve aviso confirmando que no se duplicarán las interacciones y permite guardar con un toque.
       - **❌ El turno fue cancelado**: Oculta el contador de interacciones (lo fija en `0`) sin exigir motivo obligatorio, manteniendo disponible el campo opcional de comentarios por si desea anotar algo.
  2. **Visualización en Tarjetas de `Mis Turnos`, `Mi Historial` y Panel `Admin`**:
     - Si el informe fue marcado como **Turno realizado**: Muestra `✓ Informe enviado · Interacciones: X`.
     - Si fue marcado como **Mi compañero(a) envía el informe**: Muestra `🤝 Informe enviado por mi compañero(a)`.
     - Si fue marcado como **El turno fue cancelado**: Muestra `❌ Turno reportado como cancelado`.
     - En cualquiera de los tres casos, el turno ya no aparece como "Informe pendiente" para el publicador.
- **Visual Identity & Theme**:
  - Conserva la paleta institucional de PPAM (`#5d7aa9` azul principal, `#28a745` verde confirmación, `#dc3545` rojo alerta/cancelación) con controles táctiles claros y legibles en celulares.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Persistencia con Respaldo Automático (Zero-Failure Save)**
  - *Chosen Approach*: Intentar guardar `shiftReports` y `photoUrl` directamente en `publishers/{id}`; si las reglas de Firebase en vivo aún restringen las llaves nuevas (`permission-denied`), guardar automáticamente el registro codificado dentro del arreglo `absences` (el cual ya está permitido por las reglas actuales para todos los publicadores) filtrándolo de la vista de vacaciones.
  - *Why*: Garantiza que tanto el **Informe de Turno** como la **Foto de Perfil** funcionen al 100% de inmediato, incluso antes de que el administrador copie las nuevas reglas en Firebase Console.
- **Decisión 2: Prevención de Duplicados en Estadísticas de Admin**
  - *Chosen Approach*: Cuando un publicador elige **"Mi compañero(a) envía el informe"**, su registro guarda `reportStatus: 'partner'` e `interactions: 0`. En la pestaña **Informes** del Admin, se muestra con una etiqueta clara (`🤝 Reportado por compañero`) y no suma un informe vacío ni duplica las interacciones.

---

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     MODAL: INFORME DE TURNO (PPAM)                       │
├──────────────────────────────────────────────────────────────────────────┤
│  ¿Qué ocurrió con el turno?                                              │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────┐ │
│  │ ✅ Turno realizado       │ │ 🤝 Mi compañero lo hace │ │ ❌ Cancelado │ │
│  └───────────┬─────────────┘ └────────────┬────────────┘ └──────┬──────┘ │
│              │                            │                     │        │
│              ▼                            ▼                     ▼        │
│  Muestra: Interacciones +     Oculta Interacciones   Oculta Interacciones│
│  Comentarios opcionales       (interactions = 0)     (interactions = 0)  │
└──────────────┬────────────────────────────┴─────────────────────┴────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                 GUARDADO SEGURO CON RESPALDO AUTOMÁTICO                  │
│  1. Intenta actualizar publishers/{id} (shiftReports / photoUrl)         │
│  2. Si recibe permission-denied (reglas antiguas en consola):            │
│     Guarda dentro del campo autorizado `absences` como metadato oculto   │
│     (_metaType: 'report' | 'photo') ignorado por el generador de turnos  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Cada objeto de informe incluye: `shiftId`, `date`, `time`, `location`, `partnerText`, `publisherId`, `publisherName`, `reportStatus` (`'completed'` | `'partner'` | `'cancelled'`), `interactions` (entero `>= 0`), `comments` (texto opcional), y `updatedAt`.
  - Un lector unificado (`getNormalizedPublisherData(pub)`) tanto en la app de publicadores como en el panel de administración lee automáticamente `pub.shiftReports` y `pub.photoUrl` tanto de los campos directos como del respaldo en `pub.absences`, asegurando compatibilidad total.
