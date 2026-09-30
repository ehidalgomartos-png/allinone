# Actualizar a V1.12.36

1. Parte de una instalación **V1.12.35**.
2. Sube el contenido de `Instant-Admirers-V1.12.36-PATCH-GitHub.zip` respetando las rutas.
3. No cambies PostgreSQL, Bunny ni Resend.
4. Despliega/reinicia el servicio en Render. El esquema añade automáticamente las preferencias de email.
5. Comprueba `/api/health` y confirma `version: "1.12.36"` y las funciones `social-email-notifications` y `virtual-interaction-email-alerts`.
6. Entra en **Ajustes → Notificaciones por email** y comprueba que aparecen los cuatro controles.
7. Prueba desde otra cuenta un Me gusta y un comentario. El destinatario debe recibir el correo y el botón **Ver actividad** debe abrir Actividad.
8. Si pruebas una interacción virtual, el correo debe indicar que procede de un **perfil virtual**.

No hay migración manual de base de datos.
