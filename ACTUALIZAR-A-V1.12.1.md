# Actualizar a V1.12.1

1. Sustituye el proyecto desplegado por esta versión.
2. Haz deploy en Render.
3. Comprueba `/api/health`: debe indicar `version: 1.12.1` y `enhanced-contextmenu-deterrence`.
4. Haz una recarga completa del navegador o cierra y vuelve a abrir la PWA una vez para descartar una pestaña antigua.
5. Prueba clic derecho directamente sobre una foto publicada: no debe aparecer el menú contextual de imagen.
