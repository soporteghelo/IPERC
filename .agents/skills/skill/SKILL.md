# Skill: IPERC Hybrid App Offline (HTML/CSS/Vanilla JS + IndexedDB + GAS + OCR)

## Cuando usar esta skill
Usa esta skill cuando el usuario pida construir, ampliar o corregir la app IPERC offline para mineria subterranea, con captura fotografica, IndexedDB, sincronizacion por webhook a Google Apps Script y OCR en la nube.

## Objetivo
Entregar una app movil hibrida 100% offline, lista para envolver con Capacitor/Cordova, que capture formularios IPERC con foto comprimida, almacene en IndexedDB y sincronice con un backend en Google Apps Script que guarda en Sheets/Drive y ejecuta OCR (Cloud Vision DOCUMENT_TEXT_DETECTION).

## Restricciones tecnicas obligatorias
- Solo HTML5, CSS3 y JavaScript puro (Vanilla JS).
- 100% offline: NO depender de CDN externos (Tailwind, Google Fonts, icon fonts).
- Base de datos local: IndexedDB nativa (sin librerias).
- Captura de foto: `input[type="file"][accept="image/*"][capture="environment"]`.
- Compresion con Canvas: resize max-width 1200px y export JPEG con calidad 0.5 (o bajar hasta ~0.2 si es necesario).
- Deteccion de red: `navigator.onLine` y eventos `online/offline`.
- Backend: Google Apps Script doPost con CORS correcto.
- OCR solo en backend: Cloud Vision API `DOCUMENT_TEXT_DETECTION`.
- Toda configuracion del proyecto debe reflejarse en este archivo (SKILL.md).

## Analisis de lo desarrollado hasta ahora (base para continuar)
- `index.html` ya contiene vistas: login, dashboard, programacion, historial, registro
- `app.js` ya maneja:
  - IndexedDB `iperc_offline_db` v2 con stores `iperc_records` y `programaciones`.
  - Configuracion local en `localStorage` (webhook, sheetId, driveFolderId, windows AM/PM, catalogos).
  - Captura y compresion de imagen via Canvas con meta de KB, width, height.
  - Sincronizacion manual por boton (borra registros con `response.ok`).
  - Badge de pendientes y UI de estado online/offline.
- `Code.gs` ya guarda imagen en Drive y registra fila en Sheets.

## Brechas detectadas (corregir/fortalecer)
- El `index.html` usa Tailwind CDN y Google Fonts (no offline). Migrar a CSS local y assets locales.
- CORS solo se fija en respuesta; falta manejo de preflight OPTIONS si se usa JSON.
- Hay texto con codificacion incorrecta (acentos con mojibake). Asegurar UTF-8 y fuentes locales.

## Modelo de datos (resumen esperado)
- Registro IPERC (store: `iperc_records`)
  - `id`, `createdAt`, `createdAtEpoch`, `fechaHoraLocal`
  - `usuario`, `nombreUsuario`
  - `guardia`, `turno`, `supervisor`, `trabajador`
  - `bloqueoProgramadoId`, `actividad`
  - `programacionId`, `programacionCantidad`, `programacionActividades`, `programacionFechaHora`
  - `imagenBase64`, `imagenMimeType`, `imagenKB`, `imagenWidth`, `imagenHeight`, `imagenQuality`
  - `estado` (PENDING/SYNCED), `origen`
- Programacion (store: `programaciones`)
  - `id`, `fechaHoraProgramacion`, `fechaHoraLocal`, `guardia`, `turno`, `cantidadProgramada`, `actividadesTurno`, `estado`

## Checklist de implementacion
- UI mobile-first, touch targets >= 44px, sin scroll horizontal.
- UI offline/online visible y confiable.
- Badge de pendientes en AppBar actualiza en cada cambio.
- Compresion de imagen a < 500 KB con legibilidad manuscrita.
- Guardado offline en IndexedDB y cola de sincronizacion.
- Sincronizacion segura: borrar local solo con 200 OK.
- Configuracion local operativa (webhook, Sheets, Drive, ventanas horarias, catalogos).
- Backend GAS con:
  - CORS correcto para WebView (`capacitor://localhost`, `http://localhost`).
  - Guardado en Drive (estructura por fecha/supervisor).
  - Upsert en Sheets por `recordId`.
  - OCR Cloud Vision y actualizacion de columnas adicionales.

## Procedimiento recomendado (pasos de trabajo)
1. Normalizar la UI offline:
   - Remover CDN y fuentes externas.
   - Migrar a `styles.css` con variables y estilos locales.
   - Usar SVGs locales o iconos embebidos.
2. Fortalecer flujo offline:
   - Validar campos obligatorios antes de guardar.
   - Manejo de errores de IndexedDB.
   - Estado `SYNCED` opcional para auditoria.
3. Compresion y evidencia:
   - Mantener `maxWidth=1200`, `quality=0.5` y bajar hasta 0.2 si excede 500KB.
   - Mostrar metadatos (KB, dimensiones).
4. Sincronizacion:
   - Enviar payload con `Content-Type: text/plain` para evitar preflight.
   - Reintentos controlados y no borrar si falla.
5. Backend GAS + OCR:
   - Agregar llamada a Vision API (DOCUMENT_TEXT_DETECTION).
   - Parsear texto manuscrito y guardar en columnas dedicadas.
   - Guardar credenciales en `PropertiesService`.
6. Capacitor:
   - `npx cap init`, `npx cap add android/ios`, `npx cap copy`.

## Entregables esperados
- `index.html`, `styles.css`, `app.js` con UI offline completa.
- `Code.gs` con webhook, Drive, Sheets y OCR.
- Instrucciones breves de build con Capacitor.
- Variables globales de configuración deben almacenarse en config.local.json
- Otros ficheros segun necesidad.
- preview.html debe tener toda la configuracion del proyecto para ver su progreso en tiempo real.

## Criterios de aceptacion
- Funciona 100% offline y sincroniza al recuperar red.
- No depende de CDN ni recursos externos.
- Imagen comprimida < 500 KB con texto legible.
- Pendientes visibles y sincronizacion estable.
- OCR se ejecuta solo en backend y actualiza Sheets.
