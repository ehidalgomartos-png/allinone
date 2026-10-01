# Actualizar a V1.12.37

1. Parte de una instalación **V1.12.36**.
2. Sube el contenido de `Instant-Admirers-V1.12.37-PATCH-GitHub.zip` respetando las rutas.
3. No cambies PostgreSQL, Bunny ni Resend.
4. Despliega/reinicia el servicio en Render. El esquema añade automáticamente `notifications.comment_id`.
5. Comprueba `/api/health` y confirma `version: "1.12.37"` y las funciones `activity-center-2`, `activity-grouped-likes`, `activity-direct-targets` y `virtual-notification-realtime`.
6. Entra en **Actividad** y comprueba el resumen superior, las secciones Hoy/Ayer/Esta semana y el botón **Marcar todas como leídas**.
7. Desde otra cuenta, crea varios Me gusta en una misma publicación: deben aparecer agrupados.
8. Añade un comentario y abre su notificación: debe abrir la publicación y resaltar el comentario correspondiente.
9. Prueba una interacción virtual: si el usuario está conectado, el contador de Actividad debe subir en tiempo real.

No hay migración manual de base de datos.
