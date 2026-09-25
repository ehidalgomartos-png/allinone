# Actualizar a Instant Admirers V1.12.12

1. Sustituye el proyecto V1.12.11 por esta versión y despliega normalmente en Render.
2. No hay migraciones SQL manuales ni variables nuevas.
3. Tras el despliegue, abre `/api/health` y comprueba `"version":"1.12.12"`.
4. En navegador/PWA haz una recarga completa para vaciar la caché anterior.
5. Prueba una fotografía vertical grande: debe verse sin recorte y abrirse completa al pulsarla.
