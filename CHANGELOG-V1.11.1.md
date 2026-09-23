# Changelog V1.11.1 — Contenido protegido por acceso

- Corrige una fuga de visibilidad: las publicaciones de perfiles con acceso especial bloqueado ya no aparecen en **Para ti**.
- La misma regla se aplica también a **Descubrir**, tendencias/hashtags, Guardados, republicaciones y publicaciones compartidas por mensaje.
- Se mantiene visible el perfil bloqueado y su reto de acceso, pero no su contenido hasta cumplir el reto, ser amigo o ser el propio autor.
- Stories, Reels, feed Siguiendo, búsqueda de publicaciones y perfil ya utilizaban la regla de acceso y se mantienen protegidos.
- No se borran publicaciones, favoritos ni relaciones: el filtrado se realiza en servidor según el usuario que está mirando.
- PWA y `/api/health` actualizados a 1.11.1.
