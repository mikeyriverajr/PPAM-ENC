# Plan de Unificación de Vistas (Publicador y Administración) y Herramientas Rápidas de Gestión

Unificación completa de la experiencia de Publicador y el Panel de Administración dentro del mismo enlace principal, permitiendo a los administradores alternar entre su vista personal y el panel administrativo sin recargar la página, además de editar participantes de cualquier turno directamente desde el Programa General y la pestaña de Turnos Libres.

> [!IMPORTANT]
> **Decisiones Clave Acordadas**
> - **Acceso Unificado en un Mismo Enlace**: Al iniciar sesión, la aplicación detectará automáticamente si el usuario tiene permisos de administrador (`role === 'admin'` en su documento de usuario o correo maestro). Si es administrador, aparecerá en la barra superior un selector rápido (**"Vista Publicador" / "Panel Admin"**) para alternar entre ambas vistas al instante sin recargar la página ni volver a iniciar sesión.
> - **Edición Rápida de Participantes desde la Vista General**: Cuando un administrador esté navegando en el **Programa General** o en la pestaña de **Turnos Libres**, cada turno mostrará un botón rápido de edición (`✏️ Editar`) que abrirá un selector táctil para agregar, reemplazar o quitar publicadores en ese turno desde el celular sin tener que buscar el turno en la tabla del Panel Admin.
> - **Compatibilidad con el Enlace Anterior**: Si algún administrador entra por costumbre a la ruta anterior de administración, será redirigido automáticamente a la aplicación unificada abriendo directamente el modo de Panel Admin.

---

## 1. Overview & Core Concept

Históricamente, los administradores que también son publicadores han tenido que usar dos enlaces distintos, iniciar sesión por separado y cambiar de estructura mental para realizar ajustes cotidianos (como cubrir una vacante de último minuto o revisar sus propios turnos).

Con esta mejora:
1. **Un solo inicio de sesión y una sola aplicación**: Todos entran por el mismo enlace. Los publicadores regulares ven únicamente su interfaz habitual (sin ningún elemento administrativo visible). Los administradores ven en el encabezado un botón de cambio instantáneo entre **Mi Vista de Publicador** y **Panel de Administración**, con un indicador de notificaciones pendientes.
2. **Acciones administrativas en contexto (In-Context Admin Tools)**: Desde el celular, suele ser mucho más cómodo revisar el **Programa General** o la lista de **Turnos Libres**. Ahora los administradores podrán tocar un botón de edición rápida en cualquier tarjeta de turno dentro de esas vistas para asignar o quitar publicadores al instante, respetando el filtro de cuentas inactivas y enviando o registrando el cambio directamente en Firestore.

---

## 2. User Experience & Visual Design

- **Barra Superior con Selector de Modo (Solo Administradores)**:
  - En el encabezado superior, junto al botón de "Programa General", los administradores verán un botón destacado con ícono de escudo/ajuste (`⚙️ Panel Admin` cuando están en vista publicador, o `👤 Vista Publicador` cuando están en el panel de administración), acompañado de un contador rojo si existen notificaciones o solicitudes pendientes por revisar.
  - Si un administrador maestro inicia sesión con una cuenta que no está vinculada a un perfil de publicador, la aplicación abrirá directamente el **Panel de Administración** sin mostrar error de perfil faltante, permitiéndole igualmente consultar el Programa General en cualquier momento.
- **Modal de Edición Rápida de Turno (Optimizado para Móvil)**:
  - En las tarjetas de **Turnos Libres** y en las celdas del **Programa General**, los administradores verán un botón compacto `✏️ Editar turno` con área táctil mínima de `44x44px`.
  - Al tocarlo, se abrirá una ventana modal ágil que muestra:
    - Información del turno (Ubicación, Fecha y Horario).
    - Lista de los espacios del turno (`Slot 1`, `Slot 2`, `Slot 3`, etc.) con buscador/selector de publicadores activos (indicando con estrella `⭐` quiénes tienen disponibilidad declarada para ese horario) o la opción de dejar el espacio como `"Disponible"`.
    - Botón de guardado rápido que actualiza Firestore en tiempo real y refresca inmediatamente tanto la tarjeta del turno como el Programa General.

---

## 3. Key Product Decisions & Trade-Offs

- **Carga Dinámica del Panel Administrativo vs. Carga Inicial Única**:
  - *Decisión*: Integrar las vistas y modales administrativos dentro de la estructura principal manteniendo ocultos los contenedores de administración hasta que el usuario autenticado sea verificado como administrador.
  - *Justificación*: Permite que el cambio entre "Vista Publicador" y "Panel Admin" sea instantáneo (0 ms de espera, sin recargas de página ni reconexiones a Firebase Auth), manteniendo intacta la velocidad y ligereza para los publicadores regulares.
- **Sincronización de Estado en Tiempo Real**:
  - *Decisión*: Compartir la misma sesión de autenticación y caché de datos (ubicaciones, publicadores y turnos) entre ambas vistas.
  - *Justificación*: Cuando un administrador edita un turno en el Panel Admin o mediante el botón rápido en Turnos Libres / Programa General, los cambios se reflejan inmediatamente al cambiar de vista sin necesidad de refrescar el navegador.

---

## 4. Technical Architecture & Data Strategy

```
+-----------------------------------------------------------------------+
|                     APLICACIÓN UNIFICADA (Mismo URL)                  |
|                                                                       |
|  1. Login Único (Correo o Usuario + Contraseña)                       |
|                         |                                             |
|                         v                                             |
|  2. Verificación de Rol en Firestore (`users/{uid}`)                  |
|     +-- Publicador Regular --> Muestra Vista Publicador               |
|     +-- Administrador      --> Muestra Barra de Alternancia Instantánea|
|                                                                       |
|  +---------------------------------+--------------------------------+ |
|  |        VISTA PUBLICADOR         |          PANEL ADMIN           | |
|  | - Mis Turnos / Informes         | - Generador y Tabla de Turnos  | |
|  | - Turnos Libres [+ ✏️ Editar*]  | - Directorio de Publicadores   | |
|  | - Programa Gral [+ ✏️ Editar*]  | - Informes de Turno y Alertas  | |
|  | - Mi Perfil                     | - Ubicaciones y Configuración  | |
|  +---------------------------------+--------------------------------+ |
|  (* Herramienta rápida visible únicamente para usuarios con isAdmin)  |
+-----------------------------------------------------------------------+
```

1. **Detección de Permisos (`isAdmin`)**:
   - Al completarse `auth.onAuthStateChanged`, se evalúa simultáneamente el perfil de publicador (`publisherId`) y el rol administrativo (`userData.role === 'admin' || !user.email.endsWith('@ppam.app')`).
   - El estado `isCurrentUserAdmin` habilita el botón de alternancia en la cabecera y activa los controles de edición rápida en el renderizado de **Turnos Libres** y **Programa General**.
2. **Edición Rápida de Participantes en Turnos (`shifts/{shiftId}`)**:
   - El modal rápido de edición lee el arreglo `participants` actual del turno seleccionado y presenta selectores poblados con los publicadores activos (`!isInactive`), destacando primero a los publicadores disponibles en ese bloque horario.
   - Al guardar, ejecuta `db.collection('shifts').doc(shiftId).update({ participants: updatedList })`, operación ya permitida para administradores en las reglas de seguridad (`allow update: if isAdmin()`), por lo que **no requiere volver a modificar las reglas de Firestore**.
