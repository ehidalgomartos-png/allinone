# Instant Admirers V1.12.25 — Virtual Profile Packs

## Novedades

- Packs de 6 recursos para los 99 anfitriones virtuales restantes.
- Sincronización automática e idempotente al arrancar.
- Avatar y portada base integrados en `virtual_profile_media`.
- Las cuatro escenas existentes pasan a tener metadatos completos de pack.
- Etiquetas automáticas basadas en ciudad, intereses y contexto de escena.
- ALT individualizado para cada recurso.
- Avatar y portada se migran a `/media/{id}` cuando siguen usando el recurso base.
- Lucía V. conserva intacto su pack fotográfico piloto de V1.12.24.
- Endpoint de administración `POST /api/admin/virtual-community/sync-image-packs`.
- Acción `Sincronizar packs de imágenes` en Administración.
- Métricas `complete_packs` y `pack_images` en el panel de comunidad virtual.
- Manifest `VIRTUAL-PROFILE-PACKS-V1.12.25.json` con 99 perfiles y 594 recursos.

## Seguridad / compatibilidad

- No crea usuarios nuevos.
- No genera follows, likes ni comentarios ficticios.
- No altera las métricas de usuarios reales.
- No sobrescribe imágenes personalizadas por el administrador.
- No borra recursos ni publicaciones históricas.
- La sincronización puede repetirse sin crear duplicados.

## Versión

- `/api/health`: `1.12.25`
- Service Worker/cache: `instant-admirers-v1.12.25`
- Sin variables de entorno nuevas.
- Sin migración SQL manual.
