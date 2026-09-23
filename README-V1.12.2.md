# Instant Admirers V1.12.2

Revisión de estabilidad de la capa de protección multimedia. Esta versión corrige el reinicio del proceso Node observado cuando un stream HTTP/2 de Cloudinary se cierra con `NGHTTP2_PROTOCOL_ERROR`.

No cambia la base de datos ni requiere SQL manual.

Tras desplegar, `/api/health` debe indicar `version: 1.12.2` y las features `resilient-media-streaming` y `media-upstream-error-isolation`.
