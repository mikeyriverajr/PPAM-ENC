# Animated Tutorial Player: "Cómo Completar el Informe de Turno" (Onboarding Guide Only)

This plan adds an interactive, video-style **Animated Tutorial Player** directly inside the onboarding guide (**`empezar.html`**) to show participants step-by-step how to fill out and submit their **Informe de Turno** after finishing a shift.

## 1. Overview & User Experience

### A. Placement — Onboarding Guide Only (`empezar.html`)
- Adds a new **Paso 4. Completa tu Informe de Turno** section in `empezar.html` (right after Paso 3).
- Keeps the main app (`index.html` / `app.js`) completely untouched so there is no extra clutter on the **Mis Turnos** screen.

### B. How the Animated Tutorial Player Works
- Embedded directly in `empezar.html` as a **Phone-Screen Video Player** (matching the vertical mobile proportions of the Android video above it) with smooth animations, a simulated finger tap indicator, a progress bar, **Play/Pause**, **Anterior/Siguiente**, and **Repetir** controls:
  - **Paso 1 — Al terminar tu turno (0:00 – 0:06)**:
    - Shows the **Mis Turnos** screen once a shift ends, highlighting the yellow reminder banner (*"Tienes 1 informe de turno pendiente"*) and the **Completar Informe de Turno** button with an animated tap effect.
  - **Paso 2 — Anota las interacciones (0:06 – 0:12)**:
    - Transitions into the **Informe de Turno** modal, focusing on the **"¿Cuántas interacciones tuvieron?"** input field and animating a number (`4`) being entered with a caption explaining what counts as an interaction.
  - **Paso 3 — Comparte experiencias positivas (0:12 – 0:19)**:
    - Focuses on the **"Comentarios o experiencias positivas"** text box and animates typing a short positive experience (*"Una joven se acercó al exhibidor y aceptó información..."*).
  - **Paso 4 — Guarda tu informe (0:19 – 0:25)**:
    - Animates tapping **"Guardar Informe"** and shows the shift card turning green (**"✅ Informe enviado • Interacciones: 4"**) while noting that they can still tap **Ver / Editar Informe** if they need to update it.

---

## 2. Technical Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Onboarding Guide (empezar.html)                    │
├──────────────────────────────────────────────────────────────────────┤
│  Paso 1. Obtén tus credenciales                                      │
│  Paso 2. Instala la APP                                              │
│  Paso 3. Entra y Configura la aplicación                             │
│  Paso 4. Completa tu Informe de Turno (NEW)                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │        Embedded Animated Tutorial Player                       │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Simulated Phone Viewport (CSS Keyframes + Step Engine)  │  │  │
│  │  │  • Scene 1: "Mis Turnos" -> Tap "Completar Informe"      │  │  │
│  │  │  • Scene 2: Enter Interactions Count (Animated Typing)   │  │  │
│  │  │  • Scene 3: Write Positive Experience (Animated Typing)  │  │  │
│  │  │  • Scene 4: Tap "Guardar" -> Green Confirmation Card     │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  Captions Bar (Spanish explanation for each scene)             │  │
│  │  Controls: [ ⏮ ] [ ⏯ Play/Pausa ] [ ⏭ ]   Step Dots: ● ○ ○ ○  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Files to Modify
- **`empezar.html`**:
  - Add **Paso 4. Completa tu Informe de Turno** with the self-contained animated phone tutorial player, CSS animations, Spanish captions, and playback controls.
