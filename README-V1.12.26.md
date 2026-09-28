# Instant Admirers V1.12.26 — Realistic Pack Importer

Esta versión parte de V1.12.25 y añade un importador ZIP para sustituir, por lotes, los packs base de los anfitriones virtuales por fotografías sintéticas realistas sin tener que volver a desplegar la aplicación por cada tanda.

## Funciones nuevas

- Importación desde `Administración → Comunidad virtual`.
- ZIP de hasta 100 MB y máximo 10 perfiles por lote.
- Cada perfil exige exactamente 6 imágenes: 1 avatar, 1 portada y 4 posts.
- Formatos JPG/JPEG, PNG y WEBP; máximo 10 MB por imagen.
- Manifest `instant-admirers.virtual-pack/v1`.
- Validación de rutas ZIP, manifest, usernames, número de imágenes, roles y firma real del archivo de imagen.
- Solo se importan usernames que ya existan como `is_virtual=true`.
- Subida al proveedor configurado (Bunny Storage cuando está disponible; PostgreSQL como almacenamiento local si no hay proveedor externo).
- Sustitución segura: los recursos base se archivan, no se destruyen.
- Al reimportar un pack actualizado se archiva el pack realista anterior de ese personaje.
- SHA-256 por imagen para evitar duplicados cuando se vuelve a importar exactamente el mismo archivo.
- Asignación automática de avatar y portada.
- Etiquetas, ALT, destacado y orden desde el manifest.
- Historial de lotes importados en `virtual_profile_pack_imports`.
- Nuevas métricas: packs realistas y fotografías realistas.
- Lucía V. continúa contando como pack realista piloto.

## Formato

Consulta `REALISTIC-PACK-IMPORT-FORMAT-V1.12.26.md` y `/virtual-pack-import-template.json`.

## Despliegue

No requiere variables de entorno nuevas. La nueva tabla se crea de forma idempotente al arrancar mediante `src/schema.sql`.

Tras desplegar, `/api/health` debe mostrar `version: "1.12.26"` y las features:

- `virtual-realistic-pack-importer`
- `virtual-pack-zip-validation`
- `virtual-pack-manifest-v1`
- `virtual-pack-safe-replacement`
- `virtual-pack-import-history`
