# Actualizar Instant Admirers V1.1.5 → V1.2

1. **No borres** Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.2-Seguridad-Cuentas.zip`.
3. Sube el contenido al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main` y espera al Auto-Deploy de Render.
5. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.2.0"`.

## Qué conserva

Usuarios, publicaciones, multimedia, Stories, Reels, mensajes, amigos, privacidad, administración, identidad y textos legales permanecen intactos.

## Qué añade

- Verificación de email por enlace.
- Recuperación de contraseña con token de un solo uso y caducidad de 30 minutos.
- Cambio de email con confirmación en la nueva dirección.
- Rate limiting en accesos, registros, recuperación, denuncias y escrituras API.
- Registro de eventos de seguridad visible para administración.
- Tokens guardados como hash, no en texto plano.

## Importante: correo saliente

La V1.2 funciona aunque todavía no configures SMTP. En ese caso `REQUIRE_EMAIL_VERIFICATION` debe permanecer en `false`.

Cuando configures el correo en Render, añade:

```text
APP_URL=https://instantadmirers.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=TU_EMAIL
SMTP_PASS=TU_APP_PASSWORD
EMAIL_FROM=Instant Admirers <TU_EMAIL>
REQUIRE_EMAIL_VERIFICATION=false
```

Con Gmail, `SMTP_PASS` debe ser una **contraseña de aplicación**, no la contraseña normal de la cuenta.

Primero prueba “He olvidado mi contraseña” y “Verificar email”. Cuando confirmes que los correos llegan correctamente, cambia:

```text
REQUIRE_EMAIL_VERIFICATION=true
```

Al activarlo, las cuentas cuyo email todavía no esté verificado deberán verificarlo para poder iniciar sesión.
