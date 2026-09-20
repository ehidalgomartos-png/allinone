# Render — Instant Admirers V1.2.2

La aplicación usa la API HTTPS de Resend para correo transaccional, por lo que no depende de puertos SMTP.

## Variables de entorno

```text
APP_URL=https://instantadmirers.com
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=Instant Admirers <no-reply@vrmatch.es>
REQUIRE_EMAIL_VERIFICATION=false
```

`DATABASE_URL` y `JWT_SECRET` deben conservarse como están.

## Comprobación

Abre `/api/health`. Debe mostrar `version: 1.2.2`, `email.configured: true` y `email.provider: resend`.

## Activar verificación obligatoria

Hazlo únicamente después de comprobar que los emails llegan:

```text
REQUIRE_EMAIL_VERIFICATION=true
```
