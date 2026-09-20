# Instant Admirers V1.2.1

Versión centrada en seguridad y ciclo de vida de cuentas, construida sobre V1.1.5.

## Novedades

- Verificación de email.
- Recuperación segura de contraseña.
- Cambio de email con confirmación.
- Tokens de un solo uso con hash y caducidad.
- Rate limiting para reducir fuerza bruta, spam y abuso.
- Registro de eventos de seguridad para administración.
- Mantiene toda la red social, identidad, legal, privacidad y UX anterior.

## Salud

`GET /api/health` devuelve la versión, estado de PostgreSQL y si el correo saliente está configurado.

## Despliegue

Consulta `ACTUALIZAR-A-V1.2.md`.


## V1.2.1
Corrige el flujo de recuperación para fallar rápido y mostrar mensajes claros cuando SMTP no está configurado o no responde.
