# Actualizar a V1.12.37.1

1. Parte de una instalación **V1.12.37**.
2. Sube el contenido de `Instant-Admirers-V1.12.37.1-PATCH-GitHub.zip` respetando las rutas.
3. No cambies PostgreSQL, Bunny ni Resend.
4. Despliega/reinicia el servicio en Render.
5. Comprueba `/api/health` y confirma `version: "1.12.37.1"` y las funciones `activity-person-like-grouping`, `activity-follower-grouping` y `activity-mobile-tools-scroll`.
6. Entra en **Actividad** con una cuenta que tenga varios Me gusta de la misma persona: deben aparecer en una sola línea indicando cuántas publicaciones recibieron Me gusta.
7. Pulsa **Ver publicaciones** y comprueba que aparece la lista de publicaciones afectadas y que cada una se puede abrir.
8. Si hay varios seguidores nuevos en la misma sección temporal, deben aparecer agrupados; **Ver perfiles** debe mostrar la lista correspondiente.
9. En móvil, comprueba que `Avisos del navegador`, `Marcar todo leído`, `Amigos y solicitudes` y `Privacidad` se muestran como controles compactos desplazables horizontalmente.

No hay migración manual de base de datos.
