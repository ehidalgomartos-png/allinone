# Actualizar Instant Admirers V1.2.1 → V1.2.2

1. **No borres** Render ni PostgreSQL.
2. Sube el contenido de este ZIP al mismo repositorio GitHub, sustituyendo V1.2.1.
3. Haz commit en `main` y espera el Auto-Deploy.
4. En **Render → omnisocial → Environment**, añade:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=Instant Admirers <no-reply@vrmatch.es>
APP_URL=https://instantadmirers.com
REQUIRE_EMAIL_VERIFICATION=false
```

5. Puedes borrar las variables `SMTP_*`: V1.2.2 ya no usa SMTP.
6. Abre `https://instantadmirers.com/api/health` y comprueba:

```json
"version":"1.2.2",
"email":{"configured":true,"provider":"resend","verification_required":false}
```

7. Prueba **¿Has olvidado tu contraseña?** con una cuenta existente.
8. En Resend → Emails comprueba que el mensaje aparece como enviado/entregado.
9. Prueba también **Ajustes → Cambiar email** y el reenvío de verificación.
10. Solo cuando todo funcione cambia `REQUIRE_EMAIL_VERIFICATION=true`.

## Importante

La API key es secreta. Debe existir únicamente como variable de entorno de Render; no la pongas en GitHub ni la envíes por chat.
