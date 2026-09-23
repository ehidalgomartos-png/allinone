# Actualizar a V1.12.0 — Protección de contenido

1. Sustituye en GitHub los archivos de la versión anterior por el contenido completo de este paquete.
2. No necesitas ejecutar SQL manualmente. `src/schema.sql` añade las columnas necesarias de forma idempotente.
3. Mantén `CLOUDINARY_URL` configurada en Render.
4. Espera al despliegue y comprueba `/api/health`: debe indicar `version: 1.12.0`.
5. En los logs deberías ver `Instant Admirers V1.12.0` y, si existen recursos Cloudinary antiguos, un mensaje de `Protección multimedia V1.12.0` indicando cuántos se han reforzado.
6. Haz una recarga completa o vuelve a abrir la PWA para recibir la caché `instant-admirers-v1.12.0`.

## Prueba recomendada

- Entra con dos cuentas distintas.
- Abre una publicación con foto o vídeo: la URL visible del elemento debe ser de `/protected-media/...`, no de `res.cloudinary.com`.
- Copiar esa URL a otro navegador sin la sesión correspondiente no debe mostrar el archivo.
- Un perfil exclusivo bloqueado no debe entregar su multimedia antes de completar el acceso.
- Tras desbloquearlo, la multimedia debe cargarse normalmente.
- En Privacidad, prueba las tres opciones de marca de agua.
- En vídeo, comprueba que no aparezca la opción normal de descarga del reproductor.
- Comprueba también avatar, portada, Stories, Reels y mensajes.

## Multimedia heredada

La conversión de recursos Cloudinary antiguos se ejecuta automáticamente en segundo plano y no bloquea el arranque de Render. Si algún recurso queda pendiente por un error temporal de Cloudinary, se volverá a intentar en el próximo arranque.

Si necesitas forzar el proceso manualmente desde un entorno con las variables de producción configuradas:

```bash
npm run harden:media
```

## Importante

Esta versión dificulta y controla la descarga, pero no puede impedir capturas o grabaciones de pantalla de contenido que el usuario ya tiene autorización para ver.
