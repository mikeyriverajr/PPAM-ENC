# PPAM-ENC

## Notificaciones por Correo Electrónico (Beta)

La aplicación Beta ahora incluye la capacidad de enviar notificaciones por correo electrónico a los publicadores cuando hay cambios en sus turnos (asignaciones, cancelaciones, etc.). Esta función utiliza **Nodemailer** y una cuenta de Gmail para el envío.

### Configuración del Servidor de Correo (Administradores)

Para que los correos se envíen correctamente, el administrador del proyecto debe configurar las credenciales de Gmail en las variables de entorno de Firebase Functions.

**1. Generar una "Contraseña de Aplicación" en Gmail:**
Si la cuenta de Gmail utilizada tiene la verificación en 2 pasos activada (recomendado), no puedes usar la contraseña normal. Debes crear una contraseña de aplicación:
1. Ve a tu [Cuenta de Google](https://myaccount.google.com/).
2. Selecciona **Seguridad**.
3. En "Iniciar sesión en Google", selecciona **Verificación en 2 pasos** (si no está activada, actívala primero).
4. Al final de la página, selecciona **Contraseñas de aplicaciones**.
5. En "Seleccionar aplicación", elige "Otra (Nombre personalizado)" y escribe algo como "PPAM Encarnacion".
6. Haz clic en **Generar**. Copia la contraseña de 16 letras que aparece en pantalla (sin espacios).

**2. Configurar Firebase Functions:**
Abre tu terminal (línea de comandos) en tu computadora, asegúrate de estar logueado en Firebase (`firebase login`) y ejecuta el siguiente comando reemplazando con tu correo y la contraseña generada:

```bash
firebase functions:config:set gmail.email="tu_correo_ppam@gmail.com" gmail.password="tu_contraseña_de_aplicacion_generada"
```

**3. Desplegar (Deploy) las Functions:**
Una vez configuradas las variables, debes volver a desplegar las funciones para que tomen los cambios:

```bash
firebase deploy --only functions
```

¡Listo! Cuando un publicador active la opción de "Recibir correos" en su perfil de la App Beta, comenzará a recibir notificaciones automáticas.
