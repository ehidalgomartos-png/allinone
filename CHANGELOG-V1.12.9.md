# Changelog V1.12.9 — Video Quality Startup

- Mejora del bitrate/calidad inicial de Bunny Stream en navegadores con HLS.js.
- Estimación inicial adaptada a `saveData`, `effectiveType` y `downlink` cuando están disponibles.
- Valor de reserva más razonable cuando Network Information no está disponible.
- Inicio automático de HLS sin descargar primero un fragmento de la calidad más baja solo para medir ancho de banda (`testBandwidth: false`).
- Límite de calidad adaptado al tamaño real del reproductor (`capLevelToPlayerSize`).
- ABR sigue activo para corregir calidad hacia arriba o abajo durante la reproducción.
- HLS nativo de Safari/iOS permanece sin alterar.
- Sin cambios de base de datos ni configuración de Bunny.
