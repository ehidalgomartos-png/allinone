# Actualizar Instant Admirers V1.2.2 → V1.2.3

1. No borres Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.2.3-Invitaciones-Retos.zip`.
3. Sube todo al mismo repositorio GitHub, sustituyendo los archivos actuales.
4. Haz commit en `main` y espera el Auto-Deploy de Render.
5. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.2.3"`.

## Novedades

- Enlace personal de invitación por usuario.
- Botón para compartir la invitación por WhatsApp.
- Registro de qué usuarios llegaron por cada invitación.
- Estado `registrado` y `ya publicó` para cada referido.
- Retos de amistad configurables por cada cuenta.
- El reto puede exigir entre 1 y 50 nuevos registros.
- Opcionalmente, cada invitado debe publicar al menos un post.
- Los referidos de un reto quedan vinculados a esa cuenta concreta: no se reutilizan para desbloquear otra cuenta.
- Opción de amistad automática al completar el reto.

## Migración

Se añaden de forma no destructiva:

- `users.invite_code`
- `users.friend_gate_enabled`
- `users.friend_gate_required_referrals`
- `users.friend_gate_require_post`
- `users.friend_gate_auto_accept`
- tabla `referral_attributions`

Los usuarios y datos actuales permanecen intactos.
