# Actualizar Instant Admirers V1.2 → V1.2.1

1. No borres Render ni PostgreSQL.
2. Sustituye los archivos del repositorio por los de este ZIP.
3. Haz commit en `main`.
4. Espera el Auto-Deploy de Render.
5. Comprueba `/api/health` y confirma `"version":"1.2.1"`.

## Correcciones
- Recuperar contraseña ya no se queda indefinidamente en “Enviando…”.
- Si SMTP no está configurado, muestra un mensaje inmediato y claro.
- SMTP tiene timeouts de conexión, saludo y socket.
- Si SMTP falla al enviar, la API devuelve un error explícito.
- El botón vuelve siempre a su estado normal.

## Después
Configura las variables SMTP en Render y prueba de nuevo la recuperación.
