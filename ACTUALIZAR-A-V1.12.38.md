# Actualizar a V1.12.38

Base requerida: **V1.12.37.2**.

1. Sube el contenido del ZIP PATCH sobre V1.12.37.2 en GitHub.
2. Deja que Render complete el despliegue.
3. Comprueba `/api/health` y confirma `version: "1.12.38"`.
4. No hace falta ejecutar SQL manual: `schema.sql` crea las dos preferencias nuevas y `smart_email_log` automáticamente.
5. Haz una recarga completa/PWA para renovar JS, CSS y Service Worker.
6. En **Ajustes de cuenta → Notificaciones por email**, comprueba que aparecen `Resúmenes inteligentes` y `Recordatorios para volver`.
7. Pulsa **Enviar prueba** para verificar la entrega mediante Resend.

## Comportamiento esperado

- Si el usuario está conectado o acaba de usar la app, los avisos sociales se quedan en la app y no generan correo inmediato.
- Si una persona recibe muchos Me gusta/seguimientos seguidos, el sistema evita una ráfaga de correos y puede incluirlos en un resumen posterior.
- Los resúmenes solo se generan cuando existe actividad pendiente suficiente; un mensaje privado sin leer también puede justificar un recordatorio, pero su contenido no se incluye en el email.
- Los recordatorios para volver no se envían hasta que el usuario active esa opción expresamente.

## Variables de entorno opcionales

No es necesario añadir ninguna. Si quieres ajustar el comportamiento más adelante, están disponibles:

- `SMART_EMAIL_ACTIVE_GRACE_MINUTES` (10)
- `SMART_EMAIL_LOW_SIGNAL_COOLDOWN_MINUTES` (60)
- `SMART_EMAIL_DIGEST_AFTER_HOURS` (3)
- `SMART_EMAIL_DIGEST_COOLDOWN_HOURS` (18)
- `SMART_EMAIL_RECOVERY_AFTER_DAYS` (3)
- `SMART_EMAIL_RECOVERY_COOLDOWN_DAYS` (7)

Se siguen usando `RESEND_API_KEY` y `EMAIL_FROM` ya configurados.
