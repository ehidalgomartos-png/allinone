# Instant Admirers V1.12.6 — Bunny Media

## Añadido
- Bunny Storage como proveedor principal de imágenes.
- Bunny Stream como proveedor principal de vídeos.
- Tokens Bunny HMAC-SHA256 con caducidad para imágenes y streams.
- HLS adaptativo mediante `hls.js` con fallback a HLS nativo.
- Estado `processing/ready/failed` para vídeos.
- Consulta automática de estado de Bunny Stream cada 30 segundos.
- Endpoint opcional de webhook de Bunny Stream.
- Estadísticas de almacenamiento por proveedor en Administración.
- Soporte Bunny para imágenes de publicidad subidas desde Administración.
- Nuevas variables de entorno Bunny y comprobación de readiness.

## Seguridad
- La aplicación sigue comprobando permisos antes de generar cualquier acceso protegido.
- Las nuevas subidas no usan Cloudinary como fallback salvo que se active explícitamente `ALLOW_CLOUDINARY_UPLOAD_FALLBACK=true`.
- Por defecto `HARDEN_LEGACY_MEDIA_ON_START=false` para no modificar automáticamente la cuenta Cloudinary durante la transición.
- Los tokens de vídeo se firman por directorio para que el manifiesto HLS y sus segmentos compartan el mismo acceso temporal.

## Compatibilidad
- Cloudinary se mantiene exclusivamente para leer/eliminar contenido histórico ya referenciado en PostgreSQL.
- No se realiza borrado ni migración automática de archivos antiguos.
- PostgreSQL sigue disponible como fallback local si no hay proveedor remoto para una subida, aunque el panel de lanzamiento considera Bunny incompleto hasta configurar imágenes y vídeos.

## Conservado de V1.12.5
- 40 landings SEO.
- sitemap/robots.
- Growth Engine Attribution.
- mensajes de campaña para perfiles exclusivos.
- protección de contenido y estabilidad del proxy legacy.
