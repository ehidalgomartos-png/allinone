# OmniSocial V0.4 — Comunidad propia

Esta versión deja en pausa las integraciones con redes externas y centra el proyecto en construir una red social propia.

## Funciones incluidas

- Registro e inicio de sesión.
- PostgreSQL persistente.
- Feed de cuentas seguidas.
- Descubrir contenido público.
- Publicaciones de texto, foto y vídeo.
- Visibilidad pública o solo seguidores.
- Likes y comentarios.
- Guardar publicaciones.
- Eliminar publicaciones y comentarios propios.
- Perfiles públicos dentro de la comunidad.
- Seguir / dejar de seguir.
- Contadores de publicaciones, seguidores y seguidos.
- Edición de perfil: nombre, bio, ubicación, web y avatar.
- Búsqueda de personas y publicaciones.
- Hashtags y tendencias.
- Notificaciones de nuevos seguidores, likes y comentarios.
- Diseño responsive móvil / tablet / ordenador.

## Actualización desde V0.3

No borres la base de datos. Sustituye los archivos del repositorio por los de esta versión y haz commit. `src/schema.sql` aplica las nuevas tablas/columnas con `IF NOT EXISTS`, conservando los usuarios y posts existentes.

Render hará el deploy automáticamente. Comprueba después:

`/api/health`

Debe responder con `version: "0.4.0"` y `mode: "own-community"`.

## Nota sobre multimedia

Para este MVP las imágenes y vídeos siguen guardándose en PostgreSQL. Es válido para pruebas y una comunidad inicial pequeña. Antes de crecer de forma seria conviene migrar multimedia a Cloudinary, S3 o equivalente.
