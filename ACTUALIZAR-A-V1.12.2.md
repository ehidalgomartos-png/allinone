# Actualizar a V1.12.2

1. Sustituye los archivos de la versión desplegada por este paquete.
2. Haz commit/push y despliega en Render.
3. No borres PostgreSQL ni Cloudinary.
4. Comprueba `/api/health`: debe mostrar `1.12.2`.
5. Reproduce varias fotos/vídeos y cambia rápidamente de pantalla para provocar abortos normales de cliente. El proceso Node debe seguir vivo.

No hay migración SQL nueva.
