# Control IPERC — Cerro Lindo

Aplicación web **offline-first** para el registro y seguimiento de inspecciones IPERC (Identificación de Peligros, Evaluación y Control de Riesgos) en faenas mineras. Diseñada para operar en campo sin conexión estable y sincronizar automáticamente con Google Sheets cuando hay internet disponible.

---

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Arquitectura](#arquitectura)
- [Características principales](#características-principales)
- [Vistas de la aplicación](#vistas-de-la-aplicación)
- [Configuración](#configuración)
- [Backend (Google Apps Script)](#backend-google-apps-script)
- [Sincronización bidireccional](#sincronización-bidireccional)
- [Buenas prácticas implementadas](#buenas-prácticas-implementadas)
- [Estructura de archivos](#estructura-de-archivos)
- [Instalación y despliegue](#instalación-y-despliegue)

---

## Descripción general

Control IPERC es una PWA (Progressive Web App) de página única (SPA) que permite a supervisores de campo:

1. **Crear programaciones de turno** — definen cuántos IPERC serán ejecutados en el turno (Guardia A/B/C, Día/Noche).
2. **Registrar inspecciones individuales** — cada IPERC incluye trabajador inspeccionado, actividad, evidencia fotográfica y metadatos del turno.
3. **Monitorear cumplimiento en tiempo real** — dashboard con estados COMPLETO / EN PROGRESO / PENDIENTE por programación.
4. **Sincronizar con Google Sheets** — los datos se envían al Sheets corporativo al reconectar, y los cambios remotos se descargan automáticamente.

---

## Arquitectura

```
┌─────────────────────────┐        HTTP POST/GET        ┌─────────────────────────┐
│     Aplicación Web       │ ◄─────────────────────────► │  Google Apps Script      │
│  (index.html + app.js)   │       Webhook / doGet       │  (Code.gs — backend)     │
│                          │                             │                          │
│  ┌─────────────────────┐ │                             │  ┌─────────────────────┐ │
│  │   IndexedDB (v3)    │ │                             │  │   Google Sheets     │ │
│  │  - iperc_records    │ │                             │  │  - DATA_PROGRAMA    │ │
│  │  - programaciones   │ │                             │  │  - DATA_REGISTROS   │ │
│  └─────────────────────┘ │                             │  │  - USUARIOS         │ │
│                          │                             │  │  - PERSONAL         │ │
│  ┌─────────────────────┐ │                             │  └─────────────────────┘ │
│  │   localStorage      │ │                             └─────────────────────────┘
│  │  - Session          │ │
│  │  - Users cache      │ │        ┌─────────────────────────┐
│  │  - Personal cache   │ │        │   Service Worker (sw.js) │
│  └─────────────────────┘ │        │   Cache-first para assets│
└─────────────────────────┘        └─────────────────────────┘
```

**Stack tecnológico:**

| Capa | Tecnología |
|---|---|
| UI / Estilos | HTML5, Tailwind CSS (CDN), Material Symbols |
| Lógica | JavaScript ES2020 (IIFE, async/await) — sin frameworks |
| Almacenamiento offline | IndexedDB (idb API nativa) + localStorage |
| Caché de assets | Service Worker (Cache API) |
| Backend | Google Apps Script (doGet + doPost) |
| Base de datos | Google Sheets |

---

## Características principales

### 🔐 Autenticación
- Login con **DNI + contraseña** validados contra caché local de usuarios (sincronizada desde Sheets).
- Opción **"Recordarme"** que persiste el DNI entre sesiones.
- Animación de feedback al hacer login: overlay verde (éxito) o rojo (error) con icono animado.
- Spinner de carga en el botón **INGRESAR** mientras verifica credenciales.
- Enlace **"¿Olvidó su clave?"** que abre WhatsApp con número de soporte configurable.
- Protección de sesión: si el usuario es desactivado en Sheets, se cierra su sesión al sincronizar.

### 📋 Programaciones de turno
- Creación de programaciones con: **Guardia** (A/B/C), **Turno** (Día/Noche), **meta de IPERC** y descripción de actividades.
- Ventana horaria configurable para permitir creación (ej. 10:00–13:00 y 19:00–20:00).
- Incremento de meta desde la vista de detalle (con propagación a Sheets en el siguiente sync).
- Las programaciones se muestran filtradas por supervisor de la sesión activa.

### 📷 Registros de inspección
- Captura de foto directamente desde la cámara del dispositivo.
- **Compresión automática** de imágenes en cliente: ancho máximo configurable (1200 px), calidad ajustable (0.5), límite de tamaño (500 KB).
- Selección de trabajador con **buscador en tiempo real** sobre la lista del personal.
- Descripción de actividad realizada.
- Protección al salir: si el formulario tiene datos sin guardar, pide confirmación antes de navegar.
- Botón **Eliminar foto** visible tras capturar imagen.

### 📊 Dashboard
- Tarjetas de estado con contadores en tiempo real:
  - 🔵 **COMPLETO** — meta alcanzada
  - 🟡 **EN PROGRESO** — programación de hoy con meta pendiente
  - 🔴 **PENDIENTE** — programaciones sin iniciar o de días anteriores
- Panel externo embebido como **iframe configurable** con botón de pantalla completa (overlay nativo).

### 📜 Historial
- Lista de todas las programaciones del supervisor, ordenadas por fecha descendente.
- **Búsqueda en tiempo real** por guardia, turno, supervisor o actividad.
- Tarjetas con: estado, fecha, meta, realizados, % cumplimiento, supervisor y actividades.
- **ID de la programación** visible en cursiva en la esquina inferior derecha de cada tarjeta.
- Acceso al detalle de registros de cada programación con un toque.
- Botón **Exportar CSV** que genera un reporte completo descargable (compatible con Excel, incluye BOM UTF-8).

### 🔃 Sincronización
- **Botón de sync manual** en el header con animación: spinner giratorio → ícono verde `check_circle` por 2 segundos.
- **Sync automático al recuperar conexión**: detecta el evento `online` del navegador, verifica si hay pendientes y sincroniza sin intervención del usuario.
- **Push**: sube programaciones y registros pendientes al webhook de Google Apps Script.
- **Pull**: descarga programaciones del servidor y las fusiona con los datos locales (todos los campos actualizados).
- Los registros sincronizados se marcan como `SYNCED` (no se eliminan), permitiendo consultarlos offline.
- Badge en el header que muestra el número de elementos pendientes de sync.
- Reintentos configurables (`syncRetryMax`, por defecto 3).

### 🧹 Mantenimiento automático
- **Limpieza de datos antiguos** al iniciar: elimina registros y programaciones con estado `SYNCED` que superen `retentionDays` (por defecto 14 días).

---

## Vistas de la aplicación

| Vista | Descripción |
|---|---|
| **Login** | Autenticación con animación de feedback |
| **Dashboard** | Contadores de estado + iframe de panel externo |
| **Programación** | Formulario para crear nueva programación de turno |
| **Historial** | Lista de programaciones con búsqueda y exportación |
| **Detalle de programación** | Meta, progreso, registros del turno y FAB para agregar |
| **Registro IPERC** | Formulario de captura: trabajador, actividad, foto |

---

## Configuración

Todos los parámetros operativos se centralizan en `config.local.json`:

```jsonc
{
  "webhookUrl": "https://script.google.com/macros/s/...",   // URL del Apps Script desplegado
  "sheetId":    "...",                                        // ID del Google Sheet
  "driveFolderId": "...",                                     // Carpeta Drive para fotos
  "programTab":   "DATA_PROGRAMA",                            // Pestaña de programaciones
  "registrosTab": "DATA_REGISTROS",                           // Pestaña de registros
  "usersTab":     "USUARIOS",                                 // Pestaña de usuarios
  "personalTab":  "PERSONAL",                                 // Pestaña de personal

  "amStart": "10:00",   // Inicio de ventana horaria AM
  "amEnd":   "13:00",   // Fin de ventana horaria AM
  "pmStart": "19:00",   // Inicio de ventana horaria PM
  "pmEnd":   "20:00",   // Fin de ventana horaria PM

  "retentionDays": 14,                  // Días de retención de datos sincronizados
  "companyName": "AESA - Cerro Lindo",  // Nombre de la empresa (visible en login y reportes)
  "dashboardIframeUrl": "https://...",  // URL del panel embebido (opcional)
  "supportWhatsappNumber": "+51...",    // Número para soporte vía WhatsApp

  "syncBatchSize": 100,   // Registros por lote en sync
  "syncRetryMax":  3,     // Reintentos ante fallo de sync

  "image": {
    "maxImageWidth": 1200,   // Ancho máximo de imagen comprimida (px)
    "quality": 0.5,          // Calidad JPEG (0.1 – 1.0)
    "maxImageKB": 500        // Tamaño máximo en KB
  }
}
```

> **`config.local.json` nunca se sirve desde caché del Service Worker** — siempre se lee directo desde el servidor para reflejar cambios inmediatamente.

---

## Backend (Google Apps Script)

El archivo `Code.gs` expone endpoints GET y POST:

### doGet — rutas disponibles

| `action` | Descripción |
|---|---|
| `usuarios` | Devuelve lista de usuarios activos con DNI, contraseña, nombre, cargo, guardia |
| `personal` | Devuelve lista de trabajadores para el dropdown |
| `programaciones` | Devuelve programaciones cruzadas con conteo de realizados (`realizadosRemoto`) |
| `registros` | Devuelve registros filtrados por `programacionId` |

### doPost — registros entrantes

Acepta payloads JSON con `type: 'registro'` o `type: 'programacion'` y los escribe en la pestaña correspondiente del Sheet.

---

## Sincronización bidireccional

```
Dispositivo (offline)          Red disponible           Google Sheets
─────────────                  ──────────────           ─────────────
  [Registro PENDING]
  [Programación PENDING]
                   ──── sync ────►  POST /webhook
                                        │
                                    Escribe en Sheet
                                        │
                   ◄─── pull ────  GET ?action=programaciones
  Merge local ◄──
  Estado: SYNCED
```

- Los registros locales **no se borran** tras el sync — se marcan `SYNCED`.
- El pull fusiona **todos los campos** del servidor, no solo el conteo.
- El filtro supervisor es **insensible a mayúsculas/minúsculas y acentos** (`normalizeStr` con NFD).
- Si la cuenta local de registros es menor al `realizadosRemoto`, se descargan los registros remotos faltantes automáticamente.

---

## Buenas prácticas implementadas

### Arquitectura y código
- **IIFE** (`(() => { ... })()`) — todo el código encapsulado, sin contaminación del scope global.
- **Estado centralizado** — objeto `state` único como fuente de verdad.
- **Separación de responsabilidades** — funciones específicas para UI, DB, sync, config y sesión.
- **Async/await** consistente en todas las operaciones asíncronas.
- **Sin dependencias de runtime** — cero frameworks JS; solo APIs nativas del navegador.

### Resiliencia y offline
- **Service Worker** (`sw.js`) con estrategia cache-first para assets estáticos (HTML, JS, CSS) y bypass para config y APIs externas.
- **IndexedDB** como almacenamiento principal — persiste incluso con el navegador cerrado.
- **Cola de sincronización** — registros marcados como `PENDING` hasta confirmar envío exitoso.
- **Reintentos con delay** ante fallos de red.
- **Auto-sync al reconectar** — detecta el evento `online` y dispara sync automáticamente.
- **Limpieza automática** de datos antiguos según `retentionDays`.

### Seguridad
- **Error boundary global** — `window.onerror` y `unhandledrejection` capturan errores inesperados y muestran toast informativo en lugar de dejar la app rota.
- **Timeout en todas las llamadas fetch** (`fetchWithTimeout`, 20 segundos) — previene que la app se cuelgue en redes lentas.
- **Validación de sesión** — al cada sync se verifica que el usuario siga activo en el Sheets.
- **Protección al salir de formulario** — confirma antes de descartar datos no guardados.

### UX / Interfaz
- **Diseño mobile-first** optimizado para smartphones de campo.
- **Feedback visual en cada acción**: toasts (éxito/error/advertencia), spinners, animaciones de login, animación check en sync.
- **Búsqueda en tiempo real** en historial y dropdown de trabajadores.
- **Compresión de imagen en cliente** — reduce el payload antes de subir, minimizando uso de datos móviles.
- **Modo sin conexión transparente** — barra de estado online/offline siempre visible.
- **Nombre de empresa configurable** — se refleja en login, título de pestaña y reportes exportados.

### Datos
- **Merge inteligente en pull** — preserva cambios locales pendientes al fusionar datos del servidor.
- **IDs únicos generados en cliente** — 7 caracteres alfanuméricos con al menos una letra y un número, verificados contra la DB local para evitar colisiones.
- **Formato de fecha localizado** — `Intl.DateTimeFormat` con locale `es-PE` para consistencia DD/MM/YYYY.
- **Exportación CSV con BOM UTF-8** — compatible con Excel y LibreOffice sin problema de caracteres especiales.
- **Normalización de strings** — comparaciones de supervisor insensibles a acentos y mayúsculas (`NFD + replace`).

---

## Estructura de archivos

```
IPERC/
├── index.html          # SPA principal — todas las vistas
├── app.js              # Toda la lógica de la aplicación (IIFE ~2000 líneas)
├── styles.css          # Estilos personalizados (complementan Tailwind)
├── sw.js               # Service Worker — caché offline de assets
├── config.local.json   # Configuración operativa (editable sin recompilar)
├── Code.gs             # Backend Google Apps Script
└── README.md           # Este archivo
```

---

## Instalación y despliegue

### 1. Configurar Google Sheets

Crear un Spreadsheet con las pestañas:

| Pestaña | Columnas mínimas |
|---|---|
| `USUARIOS` | dni, contrasena, nombre, cargo, area, guardia, correo, estado |
| `PERSONAL` | nombre (una persona por fila) |
| `DATA_PROGRAMA` | programaId, fechaHoraProgramacion, fechaHoraLocal, supervisor, guardia, turno, cantidadProgramada, actividadesTurno, estado |
| `DATA_REGISTROS` | id, programacionId, trabajador, actividad, guardia, turno, supervisor, fechaHoraLocal, createdAt, fotoBase64 |

### 2. Desplegar Google Apps Script

1. En el Spreadsheet: **Extensiones → Apps Script**.
2. Pegar el contenido de `Code.gs`.
3. **Desplegar → Nueva implementación** → tipo *Aplicación web*, ejecutar como *Yo*, acceso *Cualquier usuario*.
4. Copiar la URL del despliegue.

### 3. Configurar la app

Editar `config.local.json`:

```json
{
  "webhookUrl": "https://script.google.com/macros/s/TU-ID/exec",
  "sheetId": "ID-DE-TU-SPREADSHEET",
  "companyName": "Tu Empresa"
}
```

### 4. Servir la app

La app puede servirse desde cualquier servidor HTTP estático:

```bash
# Con Python
python -m http.server 8080

# Con Node.js (npx)
npx serve .

# Con Live Server de VS Code (para desarrollo)
```

> El Service Worker requiere **HTTPS** en producción (o `localhost` para desarrollo).

### 5. Uso en campo

1. Abrir la URL en el navegador del dispositivo móvil.
2. Iniciar sesión con DNI y contraseña configurados en la pestaña `USUARIOS`.
3. Al iniciar (con internet) se sincronizan automáticamente usuarios y personal.
4. Desde ese punto la app funciona **completamente offline**.
5. Pulsar el botón de sync (↻) cuando haya conexión para subir los datos al Sheets.

---

## Notas adicionales

- El Service Worker cachea `index.html`, `app.js` y `styles.css`. Si se actualiza alguno de estos archivos, incrementar la versión del caché en `sw.js` (`CACHE_NAME = 'iperc-vX'`) para forzar la actualización en los dispositivos.
- `config.local.json` está **excluido del caché** del Service Worker — cualquier cambio en ese archivo se refleja inmediatamente al recargar la app.
- Los datos de sesión y configuración se guardan en `localStorage`; los registros y programaciones en `IndexedDB`. Limpiar el almacenamiento del sitio en el navegador restablece la app al estado inicial.
