# Changelog — Instant Admirers V1.4.0

## Rendimiento

- Paginación del feed y perfiles mediante cursor.
- Paginación por offset en Para ti, Descubrir, Reels y Guardados.
- Scroll infinito con `IntersectionObserver` y botón de respaldo para navegadores antiguos.
- Consultas del feed optimizadas con CTE de candidatos antes de calcular contadores.
- Para ti limita el scoring a los 300 candidatos recientes visibles para el usuario.
- Descubrir limita el ranking a 300 candidatos recientes.
- Reels limita el ranking a 200 vídeos candidatos recientes.
- Guardados pagina antes de calcular contadores.
- Nuevos índices PostgreSQL orientados a las consultas frecuentes.

## Multimedia

- Imágenes de posts/Stories de Cloudinary servidas directamente desde CDN.
- Transformación de imágenes Cloudinary con formato automático, calidad automática y límite de 1600 px.
- Vídeos de posts/mensajes con carga diferida de metadatos.
- Vídeos fuera de la zona visible se pausan.
- Reels con `preload=none` y reproducción controlada por visibilidad.
- `loading=lazy` y `decoding=async` en imágenes relevantes.

## Frontend

- Renderizado progresivo de tarjetas con `content-visibility:auto` cuando el navegador lo soporta.
- Caché temporal del panel derecho.
- Cache-busting `?v=1.4.0` para app.js y styles.css.
- Preconexión a `res.cloudinary.com`.

## HTTP

- Assets estáticos con caché de una semana y revalidación en segundo plano.
- HTML permanece con `no-cache`.
- Redirecciones `/media/:id` hacia Cloudinary amplían caché a 24 horas.

## Compatibilidad

- Sin cambios de variables de entorno.
- Sin migración manual.
- Compatible con la base PostgreSQL existente.
- Se conserva toda la funcionalidad de V1.3.2, incluida cámara móvil y límites de subida.
