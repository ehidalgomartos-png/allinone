# Instant Admirers V1.12.35 — Comentarios visibles + personas que dieron Me gusta

V1.12.35 mejora la lectura social de las publicaciones sin cambiar el funcionamiento de V1.12.34.

## Publicaciones

Cada tarjeta puede mostrar:

- resumen de Me gusta con el nombre de una persona y “N más”;
- acceso a la lista completa de personas que han dado Me gusta;
- hasta 3 comentarios recientes directamente debajo de las acciones;
- botón “Ver los N comentarios” cuando existen más comentarios.

La interfaz funciona tanto en escritorio como en móvil y usa los colores del tema claro/oscuro existente.

## Seguridad y privacidad

Los nuevos endpoints comprueban que el usuario pueda ver la publicación antes de devolver información. También excluyen perfiles sociales ocultos y personas bloqueadas entre sí.

## Base

Esta versión parte de **V1.12.34 — Interacción virtual 2.0** y no modifica el esquema PostgreSQL.
