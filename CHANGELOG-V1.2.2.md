# V1.2.2

- Sustituye Nodemailer/SMTP por Resend API HTTPS.
- Compatible con Render Free.
- Añade `provider: resend` al estado de `/api/health`.
- Añade timeout configurable `RESEND_TIMEOUT_MS`.
- Mejora errores de envío y mensajes del frontend.
- Añade plantillas de email con identidad Instant Admirers.
- Elimina la dependencia `nodemailer`.
