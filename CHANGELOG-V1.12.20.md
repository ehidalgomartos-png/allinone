# Changelog — Instant Admirers V1.12.20

## Chat: mensajes enviados
- Corregido el contraste del mensaje propio en modo claro: burbuja fucsia/violeta con texto blanco legible.
- Añadido botón para borrar únicamente mensajes enviados por el usuario actual.
- El borrado elimina el mensaje de la conversación para ambos participantes.
- Confirmación previa para evitar borrados accidentales.
- Sincronización en tiempo real mediante `message:deleted` para que el mensaje desaparezca también en otros dispositivos.
- Si el mensaje contenía multimedia y queda sin referencias, se reutiliza la limpieza segura existente para retirar el archivo huérfano.
- Las respuestas a un mensaje eliminado quedan desvinculadas de forma segura mediante la relación existente `ON DELETE SET NULL`.

## Versión
- package: `1.12.20`
- `/api/health`: `1.12.20`
- Service Worker: `instant-admirers-v1.12.20`

No requiere migración manual de base de datos.
