# CHANGELOG — V1.12.26

## Realistic Pack Importer

- Añadido importador ZIP de packs fotográficos realistas para perfiles virtuales.
- Añadida validación ZIP segura sin dependencias externas adicionales.
- Añadido esquema de manifest `instant-admirers.virtual-pack/v1`.
- Máximo 10 perfiles y 100 MB por ZIP.
- Validación estricta de 1 avatar + 1 cover + 4 posts por perfil.
- Validación de JPG/JPEG, PNG y WEBP mediante firma de archivo.
- Añadida deduplicación SHA-256.
- Añadida sustitución segura de packs base y packs realistas anteriores.
- Añadida asignación automática de avatar/portada.
- Añadido historial `virtual_profile_pack_imports`.
- Añadidas métricas de packs e imágenes realistas en Administración.
- Añadidos informe visual de importación y manifest de ejemplo.
- Actualizado `/api/health` a 1.12.26.
- Actualizado Service Worker/cache a 1.12.26.
