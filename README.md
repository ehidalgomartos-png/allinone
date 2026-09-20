
## V0.7.1

Añade eliminación de foto de perfil y portada desde **Editar perfil**, con restauración automática del avatar por iniciales y del fondo de portada predeterminado. No requiere migraciones de base de datos.

# OmniSocial V0.7.1 — Comunidad más completa

OmniSocial V0.7 continúa sobre la V0.6 estable y mantiene usuarios, publicaciones, Stories, Reels, mensajes, amistades, likes, comentarios, guardados y notificaciones.

## Novedades V0.7

- Menciones `@usuario` clicables en publicaciones, comentarios, Stories y mensajes.
- Notificación cuando alguien te menciona en una publicación o comentario.
- Hashtags `#tema` navegables.
- Tendencias calculadas sobre los últimos 7 días, teniendo en cuenta publicaciones, autores e interacciones.
- Republicar posts públicos dentro de OmniSocial.
- Añadir un comentario propio al republicar.
- Elegir si el repost es público o solo para seguidores.
- Enviar el mismo post por mensaje privado desde el menú Compartir.
- Editar el texto y la privacidad de tus propias publicaciones.
- Marca `editado` en los posts modificados.
- Perfil avanzado con portada, frase de perfil e intereses.
- Intereses convertidos en accesos rápidos para descubrir contenido.
- Búsqueda mejorada para `@usuarios`, perfiles, biografías, intereses, publicaciones y hashtags.

## Compatibilidad

La migración es incremental. `src/schema.sql` añade las columnas nuevas con `IF NOT EXISTS`, por lo que no debes borrar la base PostgreSQL existente.

Nuevos campos principales:

- `users.headline`
- `users.interests`
- `users.cover`
- `posts.repost_of_id`
- nuevos tipos de notificación: `mention` y `repost`

## Despliegue

Si ya tienes V0.6 funcionando:

1. Descomprime el ZIP V0.7.
2. Sustituye el contenido del mismo repositorio de GitHub.
3. Haz commit en `main`.
4. Render desplegará automáticamente.
5. Comprueba `/api/health`.

Respuesta esperada:

```json
{
  "ok": true,
  "version": "0.7.0",
  "database": "postgresql",
  "mode": "own-community"
}
```

## Nota de arquitectura

La multimedia sigue almacenándose en PostgreSQL para simplificar el MVP. Antes de abrir OmniSocial a un volumen grande de usuarios, conviene migrar imágenes y vídeos a almacenamiento de objetos y mantener PostgreSQL para los datos de la red social.
