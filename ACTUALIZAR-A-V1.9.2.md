# Actualizar a Instant Admirers V1.9.2

1. Sustituye los archivos de V1.9.1 por el contenido de este ZIP en el mismo repositorio GitHub.
2. Haz commit en `main` y espera el despliegue de Render.
3. No cambies PostgreSQL, Cloudinary, Resend ni los dominios.
4. Comprueba `https://instantadmirers.com/api/health`: debe indicar `version: 1.9.2`.
5. En tu perfil, pulsa **seguidores** o **siguiendo**. También puedes pulsar esos contadores desde la tarjeta **Tu perfil** de la columna derecha.

## Qué añade
- Listas de **Seguidores** y **Siguiendo**.
- Contadores clicables en el perfil y en la columna derecha.
- Modal con pestañas para cambiar entre ambas listas.
- Botón Seguir / Siguiendo / Solicitud enviada dentro de la lista.
- Carga progresiva de 30 perfiles por bloque.
- Respeta bloqueos, cuentas privadas y perfiles con acceso especial.
