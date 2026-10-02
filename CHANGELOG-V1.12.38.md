# Instant Admirers V1.12.38 — Emails inteligentes / recuperación

Base: **V1.12.37.2 — Activity Visual Polish**.

## Cambios principales

- Nuevo motor automático de emails inteligentes ejecutado en tandas pequeñas cada 30 minutos.
- Los avisos sociales instantáneos no se envían si el destinatario está conectado o ha usado la app hace pocos minutos; la notificación dentro de la app sigue funcionando con normalidad.
- Protección de frecuencia para ráfagas de Me gusta y seguimientos: se envía el primer aviso y las siguientes acciones pueden quedar agrupadas en un resumen.
- Nuevo resumen inteligente para usuarios que llevan varias horas sin entrar y acumulan actividad pendiente.
- El resumen puede incluir Me gusta, comentarios/menciones/republicaciones, seguidores/amistades y mensajes privados sin leer, sin mostrar el contenido privado de esos mensajes.
- Los resúmenes respetan bloqueos, idioma guardado, estado de la cuenta, email verificado y preferencias de correo.
- Nuevo recordatorio de recuperación para usuarios que llevan varios días sin entrar y tienen nueva actividad o perfiles activos por descubrir.
- Los recordatorios para volver son **opt-in**: la preferencia nace desactivada y solo se envían si el usuario la activa explícitamente.
- Registro `smart_email_log` para limitar frecuencia y evitar envíos repetidos.
- Ajustes de cuenta ampliados con `Resúmenes inteligentes` y `Recordatorios para volver`.
- Botón `Enviar prueba` para comprobar inmediatamente que Resend y la plantilla del resumen funcionan.
- Plantillas y textos ES/EN actualizados.
- Caché PWA y versión de assets actualizadas a V1.12.38.

## Base de datos

El esquema se actualiza automáticamente al arrancar:

- `users.email_smart_digest_notifications` — `TRUE` por defecto.
- `users.email_recovery_notifications` — `FALSE` por defecto.
- Nueva tabla `smart_email_log` con índice por usuario, tipo y fecha.

No hay migración manual.

## Frecuencia por defecto

- No enviar correo social si el usuario está conectado o ha estado activo en los últimos **10 minutos**.
- Ráfagas de Me gusta/seguimientos: máximo aproximado de un aviso de baja prioridad por **60 minutos**.
- Resumen inteligente: a partir de **3 horas** de inactividad, con enfriamiento de **18 horas** entre resúmenes.
- Recuperación: a partir de **3 días** de inactividad, con máximo de un recordatorio cada **7 días**.

Estos valores pueden ajustarse mediante variables de entorno opcionales sin ser necesarias para el despliegue normal.
