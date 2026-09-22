# Instant Admirers V1.3

## Multimedia externa
- Cloudinary como almacenamiento multimedia principal.
- Nuevas fotos y vídeos dejan de guardarse como BYTEA en PostgreSQL cuando `CLOUDINARY_URL` está configurada.
- PostgreSQL conserva id, propietario, MIME, tamaño, URL segura y metadatos.
- `/media/:id` mantiene compatibilidad y redirige al CDN para archivos externos.
- Compatibilidad completa con archivos antiguos guardados en PostgreSQL.

## Migración segura
- `npm run migrate:media` migra el histórico a Cloudinary.
- El binario se elimina de la fila solo después de una subida confirmada.
- Una migración fallida conserva el original.

## Limpieza
- Al borrar una foto/portada, post o Story, se intenta retirar el asset externo cuando ya no tiene referencias.
- Al eliminar una cuenta se eliminan sus assets Cloudinary conocidos.

## Administración
- Nuevo endpoint `/api/admin/media-storage` para consultar estado de almacenamiento.
- `/api/health` muestra el proveedor multimedia activo.
