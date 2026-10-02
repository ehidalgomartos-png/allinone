# CHANGELOG V1.12.41 — Gestión visual de perfiles virtuales 2.0

Base: **V1.12.40.1 estable**.

## Nuevo

- Nuevo editor **Gestión visual 2.0** para cada uno de los 100 perfiles virtuales.
- Vista protegida de todas las imágenes activas y archivadas del personaje.
- Resumen de imágenes activas, fotos de publicaciones, referencias históricas y duplicados exactos conocidos.
- Sustitución de **una sola foto** sin volver a importar un ZIP completo.
- Opción para reenlazar automáticamente posts y Stories históricos cuando se sustituye una imagen defectuosa.
- Cambio individual de avatar y portada.
- Reordenación de las fotos destinadas a próximas publicaciones automáticas.
- Retirada/archivo y restauración de imágenes.
- Borrado definitivo protegido: una imagen activa debe archivarse antes de poder eliminarla.
- Detección de duplicados exactos mediante SHA-256 cuando el hash está disponible (incluye las imágenes del importador masivo V1.12.40+).
- Historial de cambios visuales por perfil.
- Botón **Deshacer último cambio** para operaciones reversibles.
- Las subidas nuevas guardan hash SHA-256 para detectar duplicados posteriores.

## Seguridad

- Cada operación reversible guarda snapshot del estado previo.
- Un rollback de sustitución restaura avatar/portada, pool anterior y las referencias históricas exactas que se habían reenlazado.
- Al sustituir una foto con reenlace histórico, el historial de uso de posts/Stories se mueve a la nueva imagen y vuelve a la anterior si haces rollback.
- Un rollback masivo V1.12.40 queda bloqueado si existen cambios visuales individuales posteriores a la importación, evitando que estos ajustes se pierdan silenciosamente.
- Los previews del editor usan URLs administrativas firmadas y temporales.
- Las imágenes archivadas no se eliminan del almacenamiento mientras sigan referenciadas.

## Compatibilidad

- Mantiene intacto el importador masivo, incluida la corrección por username de V1.12.40.1.
- No requiere variables de entorno nuevas.
- `src/schema.sql` crea automáticamente la nueva tabla `virtual_visual_actions` al arrancar.
