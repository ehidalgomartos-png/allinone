# Actualizar Instant Admirers V1.3.0 → V1.3.1

Esta revisión corrige el límite de vídeo y el estado bloqueado del botón al fallar una subida.

## Cambios

- Vídeos: hasta 100 MB.
- Imágenes: hasta 10 MB.
- Validación antes de subir en publicaciones, Stories, mensajes y perfil.
- Tiempo de espera de subida ampliado a 5 minutos para vídeos grandes.
- Si una subida falla, el botón deja de mostrar `Publicando…` y vuelve a quedar disponible.
- Mensajes de error claros cuando un archivo supera el límite.
- No hay migraciones de PostgreSQL.
- No cambia `CLOUDINARY_URL`.

## Actualización

1. Descomprime el ZIP de V1.3.1.
2. Sustituye los archivos del mismo repositorio de GitHub.
3. Haz commit/push y espera el deploy automático de Render.
4. Comprueba `https://instantadmirers.com/api/health`.
5. Debe mostrar `"version":"1.3.1"` y `"provider":"cloudinary"`.
6. Prueba primero un vídeo de más de 25 MB y menos de 100 MB.

No ejecutes `npm run migrate:media` hasta confirmar que las subidas nuevas funcionan correctamente.
