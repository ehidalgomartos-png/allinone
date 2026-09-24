# Instant Admirers V1.12.6 — Bunny Media

V1.12.6 cambia el proveedor principal de multimedia sin perder V1.12.5 (SEO 40 landings), Growth Engine, perfiles exclusivos ni la protección de contenido.

## Arquitectura nueva

- **Imágenes nuevas:** Bunny Storage (`instant-admirers-media`).
- **Vídeos nuevos:** Bunny Stream (Library ID `761236`) con HLS adaptativo.
- **Entrega de imágenes:** CDN Bunny con URL firmada temporal.
- **Entrega de vídeo:** HLS Bunny con token de directorio temporal.
- **Autorización:** Instant Admirers comprueba sesión, privacidad, bloqueos y acceso al perfil antes de entregar el enlace temporal.
- **Cloudinary:** solo compatibilidad temporal con multimedia histórica. Las nuevas subidas no vuelven automáticamente a Cloudinary si Bunny no está configurado.

## Protección conservada

- perfiles con reto de invitaciones;
- contenido oculto hasta desbloquear;
- URL interna ligada al usuario y a la sesión;
- token Bunny con caducidad;
- marcas de agua del espectador;
- bloqueo de clic derecho/arrastre como disuasión;
- contenido protegido fuera de la caché PWA.

## Vídeo

Bunny Stream procesa cada vídeo después de la subida. Mientras se codifica, la aplicación muestra `Procesando vídeo…`. El servidor consulta el estado cada 30 segundos. Opcionalmente puede recibir el webhook de Bunny.

En navegadores con HLS nativo se usa el reproductor del navegador. En el resto se usa `hls.js` servido por la propia aplicación.

## Compatibilidad Cloudinary

Los registros antiguos cuyo `provider` sea `cloudinary` continúan intentando servirse mediante la capa de compatibilidad existente. V1.12.6 **no migra ni borra automáticamente** esos archivos. Esto es intencionado: la cuenta de Cloudinary puede estar restringida y no queremos provocar pérdida de datos.

Consulta `BUNNY-CONFIGURACION-V1.12.6.md` antes de desplegar.
