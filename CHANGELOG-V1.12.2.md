# Instant Admirers V1.12.2 — Proxy multimedia estable

## Corrección principal
- La entrega de Cloudinary deja de usar `Readable.fromWeb(...).pipe(res)` sin supervisión.
- Se usa `stream/promises.pipeline()` para capturar fallos del stream upstream.
- Un `ERR_HTTP2_STREAM_ERROR`, `TypeError: terminated`, cierre prematuro o aborto de Cloudinary ya no debe finalizar el proceso Node.
- Los cierres normales del cliente (cambiar de página/Reel, cerrar pestaña o cancelar vídeo) se absorben sin tumbar el servidor.
- Timeout de 20 s solo para conexión/cabeceras del upstream; no limita la duración completa del vídeo.
- Si el fallo ocurre antes de enviar cabeceras, la petición recibe 502/504. Si ya estaba transmitiendo, se cierra únicamente esa respuesta.
- Registro técnico `protected_media_upstream_error` y log `Protected media upstream error: media ...`.

## Compatibilidad
Mantiene toda la protección de V1.12.1: URLs firmadas, sesión multimedia, proxy protegido, Cloudinary authenticated, marcas de agua y bloqueo reforzado de descarga casual.
