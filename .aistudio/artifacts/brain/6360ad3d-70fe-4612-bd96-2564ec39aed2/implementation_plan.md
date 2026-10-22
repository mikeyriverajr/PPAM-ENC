# Cuentas Inactivas, Gestión de Informes en Admin y Mejoras de Contraseña

Este plan incorpora tres mejoras clave para la administración y el uso diario de PPAM Encarnación: la posibilidad de pausar o marcar cuentas como **Inactivas** sin perder las preferencias de horario, herramientas completas para el administrador en **Informes de Turno** (filtro por ubicación, edición y eliminación), y un inicio de sesión simplificado para evitar el olvido frecuente de contraseñas.

## Revisión del Usuario y Decisiones Confirmadas

> [!IMPORTANT]
> **Decisiones confirmadas por el usuario:**
> - **Acceso y Reactivación de Cuenta Inactiva**: Cuando un publicador marca su cuenta como inactiva en **Mi Perfil**, conserva acceso completo a la aplicación para consultar el programa y puede volver a activar su cuenta por sí mismo en cualquier momento (además de que el administrador también puede activarla o desactivarla desde el Directorio).
> - **Simplificación de Contraseñas**:
>   1. **Eliminar la obligación de cambiar contraseña en el primer inicio de sesión**, permitiendo que los publicadores utilicen directamente la clave asignada por el administrador.
>   2. **Botón para ver/ocultar contraseña (icono de ojo) y guardado automático en el celular** (`autocomplete="username"` y `autocomplete="current-password"`) en las pantallas de ingreso.

---

## 1. Resumen y Concepto Principal

- **Qué hace**:
  1. **Modo Inactivo (Pausa Indefinida)**: Permite que tanto el publicador (desde *Mi Perfil*) como el administrador (desde el *Directorio*) marquen una cuenta como **Inactiva**. Mientras esté inactiva, el generador automático ignora al publicador sin borrar sus casillas de disponibilidad semanal.
  2. **Gestión Avanzada de Informes (Admin)**: Añade un filtro por **Ubicación** en la pestaña *Informes* (que recalcula también los totales de interacciones y reportes) y botones en cada informe para **Editar** o **Eliminar** el registro.
  3. **Inicio de Sesión Sin Fricción**: Desactiva el bloqueo de cambio forzoso de contraseña al entrar por primera vez, añade el botón de mostrar/ocultar contraseña y habilita el autocompletado nativo de Android/iOS.
- **Valor Principal**: Ahorra tiempo administrativo al evitar restablecimientos constantes de contraseñas, facilita pausar temporalmente a publicadores sin que pierdan su configuración horaria y permite corregir informes duplicados o erróneos.

---

## 2. Experiencia de Usuario y Diseño Visual

### Flujos de Usuario Clave

1. **Pausar / Reactivar Cuenta (Vista del Publicador y Admin)**:
   - **En la App del Publicador (*Mi Perfil* y *Mis Turnos*)**:
     - En *Mi Perfil*, una tarjeta destacada **"Estado de mi Cuenta"** muestra si la cuenta está **Activa (Recibiendo turnos)** o **Inactiva (En pausa indefinida)** con un botón claro para pausar o reactivar en un toque.
     - Si la cuenta está inactiva, aparece un aviso informativo en *Mis Turnos* recordándole al publicador que no recibirá nuevas asignaciones automáticas hasta que reactive su cuenta, con un botón directo de **"Reactivar mi cuenta"**.
   - **En el Panel de Admin (*Directorio*, *Generador* y *Disponibilidad*)**:
     - En el formulario de creación/edición del publicador y en la ficha de detalles, el administrador puede cambiar el estado a **Inactivo (En pausa)**.
     - Las tarjetas del directorio muestran una etiqueta clara `Inactivo` para identificarlos rápidamente.
     - El **Generador Automático**, el **Calculador de Estadísticas del Borrador** y la pestaña **Consultar Disponibilidad** excluyen automáticamente a los publicadores inactivos (en la adición manual de un turno aparecen identificados al final bajo *No Disponibles / Ausentes / Inactivos*).

2. **Filtrar, Editar y Eliminar Informes de Turno (Panel de Admin)**:
   - **Filtro por Ubicación**: En la barra de filtros de la pestaña *Informes*, junto al selector de mes y de estado, se añade un selector desplegable **Todas las ubicaciones**. Al elegir una ubicación, tanto la lista de informes (enviados o pendientes) como los 3 contadores superiores (*Informes Recibidos*, *Total de Interacciones*, *Experiencias / Comentarios*) se actualizan al instante para esa ubicación.
   - **Editar Informe**: Cada tarjeta de informe recibido incluye un botón **Editar** que abre un modal donde el administrador puede modificar el estado (*Turno realizado*, *Compañero(a) lo reporta*, *Turno cancelado*), la cantidad de interacciones y el comentario/experiencia.
   - **Eliminar Informe**: Cada tarjeta incluye un botón **Eliminar** con confirmación que borra el informe del registro del publicador y actualiza los totales inmediatamente.

3. **Inicio de Sesión Simplificado y Visibilidad de Contraseña**:
   - En la pantalla de login de publicadores, en la sección *Seguridad* de *Mi Perfil* y en el login de *Admin*, cada campo de contraseña cuenta con un botón de **ojo (`visibility` / `visibility_off`)** para verificar lo escrito antes de presionar Ingresar.
   - Los formularios de login utilizan etiquetas semánticas `<form>` y atributos `autocomplete` estándar para que Chrome (Android) y Safari (iPhone) ofrezcan guardar la contraseña automáticamente.
   - Las cuentas nuevas o existentes ya no muestran el modal bloqueante de *Cambio Obligatorio* al iniciar sesión.

---

## 3. Decisiones de Producto y Arquitectura

- **Decisión 1: Campo `isInactive` independiente del horario (`availability`)**
  - *Enfoque elegido*: Guardar un indicador booleano `isInactive` (sincronizado también con soporte cuando `status === 'Inactivo'`) manteniendo intacto el arreglo `availability` del publicador.
  - *Por qué*: Cuando el publicador vuelve a estar activo semanas o meses después, todos sus turnos habituales siguen marcados tal como los dejó. Además, incluimos respaldo automático en `absences` (`_metaType: 'inactive'`) y actualizamos `firestore.rules` añadiendo `'isInactive'`.

- **Decisión 2: Sincronización limpia al editar o eliminar informes desde Admin**
  - *Enfoque elegido*: Al editar o borrar un informe como administrador, se actualiza tanto el mapa `shiftReports` del documento del publicador como cualquier entrada de respaldo en `_metaAbsences` (y `shift.reports` si existiera).
  - *Por qué*: Garantiza que un informe editado o eliminado no reaparezca por datos residuales y que el publicador vea el cambio reflejado también en su propio historial.

---

## 4. Arquitectura Técnica y Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FIRESTORE: publishers/{pubId}                    │
│  • availability: [...] (se conserva intacto al pausar la cuenta)        │
│  • isInactive: boolean (true = en pausa indefinida, false = activo)     │
│  • shiftReports: { [shiftId]: { reportStatus, interactions, comments } }│
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│        APP PUBLICADOR (index/app)     │ │    PANEL ADMIN (admin/admin)  │
│ • Login con <form>, autocomplete y 👁️ │ │ • Directorio: Badge y selector│
│ • Sin bloqueo de cambio obligatorio   │ │   de estado Activo / Inactivo │
│ • Mi Perfil / Mis Turnos: Interruptor │ │ • Generador y Disponibilidad: │
│   para pausar o reactivar su cuenta   │ │   excluye cuentas inactivas   │
│                                       │ │ • Pestaña Informes:           │
│                                       │ │   - Filtro por Ubicación      │
│                                       │ │   - Modal Editar Informe      │
│                                       │ │   - Botón Eliminar Informe    │
└───────────────────────────────────────┘ └───────────────────────────────┘
```

### Mapa de Componentes e Interacciones
- **Autenticación y Contraseñas**:
  - `togglePasswordVisibility(inputId, btnEl)`: Alterna el atributo `type` entre `password` y `text` y actualiza el icono Material Symbols (`visibility` / `visibility_off`).
  - `savePublisher()` y `onAuthStateChanged`: Establecen `requirePasswordChange: false` por defecto e ingresan directamente al panel principal sin mostrar `#force-password-modal`.
- **Estado Inactivo de Cuenta**:
  - `toggleMyAccountActiveStatus()` en la vista del publicador: Permite pausar o reactivar la cuenta con confirmación clara y actualiza la interfaz al instante.
  - Filtros en `generateDraft()`, `openDraftStatsModal()` y `checkAvailability()`: Verifican `!isPublisherInactive(pub)` antes de incluir al publicador en el sorteo o conteo de disponibilidad.
- **Gestión de Informes en Admin**:
  - `rep-location-filter`: Se puebla dinámicamente con las ubicaciones presentes en los turnos y filtra tanto las tarjetas como los KPIs.
  - `openAdminEditReportModal(shiftId, pubId)`, `saveAdminEditedReport()` y `deleteAdminShiftReport(shiftId, pubId)`: Permiten editar cualquier campo del informe o eliminarlo por completo con actualización inmediata en pantalla.
