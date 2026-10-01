# V1.12.37 — Centro de actividad 2.0

## Cambios

- Rediseño completo de **Actividad** con tarjetas más visuales y avatar del actor.
- Resumen superior de novedades pendientes por tipo: Me gusta, comentarios/menciones, conexiones y mensajes.
- Las notificaciones ya **no se marcan todas como leídas solo por abrir Actividad**.
- Botón **Marcar todas como leídas** y lectura individual al abrir una notificación.
- Agrupación de varios **Me gusta sobre la misma publicación** para evitar listas repetitivas.
- Secciones cronológicas: **Hoy, Ayer, Esta semana y Anteriores**.
- Acceso directo al destino: publicación, comentario concreto, perfil, solicitudes o mensajes según el tipo.
- Los comentarios nuevos guardan `comment_id` en la notificación para poder resaltarlos al abrirlos desde Actividad.
- Modal de **Actividad de la publicación** con la publicación original y sus comentarios; el comentario objetivo se resalta y se desplaza a pantalla.
- Identificación visible de **Perfil virtual** dentro del Centro de actividad.
- Las interacciones automáticas de perfiles virtuales ahora emiten también la notificación Socket.IO en tiempo real, además del email ya existente.
- El contador del menú se actualiza al leer una notificación o al marcar todas como leídas.
- Ajustes responsive específicos para móvil.

## Base de datos

Se añade automáticamente `notifications.comment_id` con referencia a `comments(id)` y un índice parcial. No requiere migración manual.

## Compatibilidad

Parte directamente de **V1.12.36** y conserva Notificaciones sociales por email, Comentarios/Likes, Interacción virtual 2.0, Actividad virtual 2.0, Bunny Media y el resto de funciones existentes.
