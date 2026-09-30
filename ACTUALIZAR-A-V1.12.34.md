# Actualizar a V1.12.34

1. Parte de **V1.12.33 estable**.
2. Sube el contenido de `Instant-Admirers-V1.12.34-PATCH-GitHub.zip` respetando las rutas.
3. Render ejecutará `npm start`; `initDb()` añadirá de forma idempotente:
   - columnas de interacción en `virtual_profiles`,
   - tabla `virtual_interaction_log`,
   - índices asociados.
4. Comprueba `https://instantadmirers.com/api/health` y confirma `version: "1.12.34"`.
5. En `Administración → Comunidad virtual`, pulsa **Reprogramar interacciones** una sola vez para repartir los primeros horarios.
6. Para una prueba controlada, pulsa **Generar interacciones ahora**. Debes ver en el historial el like, comentario o follow generado.
7. Revisa desde una cuenta real que la notificación muestre el actor como perfil virtual.

No es necesario reimportar ni modificar ningún pack de imágenes.
