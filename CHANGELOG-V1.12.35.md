# V1.12.35 — Comentarios visibles + personas que dieron Me gusta

## Cambios

- Las tarjetas de publicación muestran ahora hasta **3 comentarios recientes** sin abrir el modal.
- Cuando hay más de 3 comentarios aparece **“Ver los N comentarios”**.
- Las publicaciones con Me gusta muestran **quién ha dado like** y, cuando hay más, el resumen “y N más”.
- Al pulsar el resumen de Me gusta se abre una lista con las personas que han reaccionado.
- Los perfiles virtuales continúan identificados con la etiqueta **Virtual** también en la lista de Me gusta y en los comentarios visibles.
- Los previews se cargan mediante una petición agrupada de hasta 30 publicaciones para evitar una petición independiente por cada tarjeta.
- Los previews respetan visibilidad de publicaciones, perfiles ocultos y bloqueos entre usuarios.
- Al dar/quitar Me gusta, publicar un comentario o borrar uno, la tarjeta se actualiza sin recargar toda la vista.

## Compatibilidad

Parte directamente de **V1.12.34 estable**. No modifica esquema de base de datos, packs fotográficos, actividad virtual 2.0 ni interacción virtual 2.0.
