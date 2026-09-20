# Instant Admirers V1.2.2 — Resend API

Esta versión sustituye el correo SMTP por la API HTTPS de **Resend**, pensada para funcionar también con el plan Free de Render.

## Funciones de correo
- Verificación de email.
- Recuperación de contraseña.
- Confirmación de cambio de email.
- Plantillas visuales de Instant Admirers.
- Timeout de 12 segundos para llamadas a Resend.
- Registro de eventos de seguridad existente.

## Variables necesarias en Render

```text
APP_URL=https://instantadmirers.com
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=Instant Admirers <no-reply@vrmatch.es>
REQUIRE_EMAIL_VERIFICATION=false
```

`vrmatch.es` debe permanecer verificado en Resend. No subas `RESEND_API_KEY` a GitHub.

Cuando hayas comprobado que recuperación y verificación funcionan, puedes cambiar `REQUIRE_EMAIL_VERIFICATION=true`.

La base PostgreSQL y los usuarios existentes se conservan.
