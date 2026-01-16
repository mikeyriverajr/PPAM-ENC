# Guía de Despliegue de Funciones (Cloud Functions)

Para que el "Reseteo de Contraseña" y el "Sistema de Notificaciones" funcionen, debes desplegar el código del servidor (`functions/`).

## Requisitos Previos

1.  **Node.js**: Asegúrate de tener Node.js instalado.
2.  **Firebase CLI**: Instala la herramienta de línea de comandos de Firebase:
    ```bash
    npm install -g firebase-tools
    ```

## Pasos para Desplegar

1.  **Iniciar Sesión en Firebase**
    ```bash
    firebase login
    ```
    (Sigue las instrucciones en el navegador).

2.  **Inicializar el Proyecto (Solo la primera vez)**
    Sitúate en la raíz de este proyecto (donde está este archivo `DEPLOY.md`) y ejecuta:
    ```bash
    firebase init functions
    ```
    *   **¿Project Setup?** Selecciona "Use an existing project" -> elige `ppam-beta`.
    *   **¿Language?** JavaScript.
    *   **¿ESLint?** No (opcional).
    *   **¿Install dependencies?** Yes.

    *Nota: Si te pregunta si quieres sobrescribir `functions/package.json` o `functions/index.js`, dile que **NO** (N), ya que yo ya creé esos archivos por ti.*

3.  **Desplegar**
    Ejecuta el siguiente comando para subir el código a la nube:
    ```bash
    firebase deploy --only functions
    ```

    *Si ves un error sobre "Billing Account", significa que debes actualizar tu proyecto de Firebase al plan "Blaze" (Pago por uso). Las funciones requieren esto, aunque tienen una capa gratuita generosa.*

## Verificación

Una vez desplegado:
1.  Ve al panel de Firebase -> Functions.
2.  Deberías ver `resetUserPassword` y `onShiftChange` listados con un check verde.
