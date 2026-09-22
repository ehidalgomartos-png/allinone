# Actualizar Instant Admirers a V1.3.2

V1.3.2 añade captura directa desde la cámara del móvil sin quitar la selección desde galería.

## Qué cambia

- Crear publicación: Galería + Hacer foto + Grabar vídeo en móvil.
- Stories: Galería + Hacer foto + Grabar vídeo en móvil.
- Mensajes: Galería + cámara de foto + cámara de vídeo en móvil.
- Editar perfil: Galería + cámara para avatar y portada.
- El avatar solicita preferentemente la cámara frontal; el resto usa preferentemente la cámara trasera.
- Se mantienen los límites de V1.3.1: imágenes 10 MB, vídeos 100 MB.
- No hay migraciones de PostgreSQL.
- No cambia la configuración de Cloudinary.

## Actualización

1. Descomprime el ZIP V1.3.2.
2. Sustituye los archivos del repositorio GitHub actual por los del ZIP.
3. Haz commit en `main`.
4. Espera el despliegue automático de Render.
5. Comprueba `https://instantadmirers.com/api/health`.
6. Debe indicar `"version":"1.3.2"` y Cloudinary configurado.
7. Desde un móvil abre Crear publicación y comprueba Galería / Foto / Vídeo.

## Nota de compatibilidad

El atributo web `capture` solicita al navegador del móvil abrir la cámara/cámara de vídeo. El comportamiento final puede variar ligeramente entre iPhone/iOS, Android y el navegador utilizado. En todos los casos se mantiene disponible la galería.
