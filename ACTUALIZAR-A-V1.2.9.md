# Actualizar Instant Admirers V1.2.8 → V1.2.9

1. No borres Render ni PostgreSQL.
2. Sustituye los archivos del repositorio por los de este ZIP.
3. Haz commit en `main` y espera al Auto Deploy.
4. Comprueba `/api/health`: debe indicar `1.2.9`.

## Corrección principal

- Las URLs directas `/usuario` se validan antes de usarse como destino.
- Tras login/registro, el perfil solicitado tiene prioridad sobre Inicio.
- El destino solo se borra cuando el perfil se carga correctamente.
- Si el perfil no existe o falla, se mantiene la URL y se muestra un error con Reintentar; ya no se envía silenciosamente al feed.

## Prueba recomendada

Abre en incógnito `https://instantadmirers.com/USUARIO_REAL`, inicia sesión y verifica que aterrizas en ese perfil.
