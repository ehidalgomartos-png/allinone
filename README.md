# Instant Admirers V1.2.3 — Invitaciones y retos de amistad

Esta versión añade crecimiento viral nativo a Instant Admirers.

## Invitaciones

Cada usuario tiene un enlace único que puede compartir por WhatsApp. Si una persona crea una cuenta desde ese enlace, queda registrada como referido del invitador. Cuando el nuevo usuario publica por primera vez, pasa a estado `ya publicó`.

## Retos de amistad

Cada cuenta puede activar una condición antes de aceptar nuevas amistades. Ejemplo:

> Invita a 5 amigos a Instant Admirers. Cuando los 5 se registren desde tu enlace de reto y publiquen al menos 1 post, desbloquearás la amistad con esta cuenta.

Los referidos quedan asociados al reto de esa cuenta concreta, por lo que los mismos invitados no desbloquean todos los perfiles con condición.

La cuenta puede elegir si al completar el reto la amistad se acepta automáticamente o si simplemente se desbloquea el envío de la solicitud.

## Base técnica

- Node.js / Express
- PostgreSQL
- Socket.IO
- Resend API para correo transaccional
- Render
