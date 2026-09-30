# V1.12.36 — Notificaciones sociales por email

## Cambios

- Envía correos transaccionales mediante **Resend** cuando otra persona interactúa con el usuario.
- Avisos incluidos: **Me gusta, comentarios, menciones, republicaciones, nuevos seguidores, solicitudes/aceptaciones de seguimiento y solicitudes/aceptaciones de amistad**.
- Las interacciones de perfiles virtuales también pueden generar aviso por email y el correo identifica claramente que el actor es un **perfil virtual**.
- Los correos respetan el idioma guardado de la cuenta (ES/EN) y enlazan directamente a **Actividad**.
- Solo se envían a cuentas reales activas con email verificado.
- Protección contra dobles correos por acciones repetidas del mismo actor sobre el mismo contenido en una ventana corta.
- Nuevo panel **Ajustes de cuenta → Notificaciones por email** con interruptor general y controles separados para Me gusta, comentarios/menciones y seguidores/amistades.
- La entrega de la interacción no depende del correo: si Resend falla, el like/comentario/follow sigue funcionando con normalidad.

## Base de datos

El esquema añade automáticamente cuatro preferencias booleanas a `users`; no hay migración manual.

## Compatibilidad

Parte directamente de **V1.12.35** y conserva Comentarios visibles + personas que dieron Me gusta, Interacción virtual 2.0, Actividad virtual 2.0, Bunny y el resto de funciones existentes.
