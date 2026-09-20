# V1.2 · Seguridad y cuentas

- Verificación de email por token de un solo uso (24 h).
- Recuperación de contraseña (30 min).
- Cambio de email confirmado en la nueva dirección (60 min).
- Tokens almacenados con SHA-256; nunca se persiste el token enviado por email.
- Invalidación de sesiones tras cambio o recuperación de contraseña.
- Rate limiting para login, registro, recuperación, denuncias y escrituras.
- Eventos de seguridad para administración, con IP derivada mediante HMAC en vez de IP en claro.
- Panel de administración muestra los últimos eventos de seguridad.
- Despliegue compatible con la base existente mediante migraciones `IF NOT EXISTS`.
