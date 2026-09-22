# Actualizar Instant Admirers a V1.8.0

1. Descomprime el ZIP y sustituye los archivos del repositorio actual.
2. Haz commit/push a `main`; Render desplegará automáticamente.
3. No cambies PostgreSQL, Cloudinary, Resend ni los dominios.
4. Comprueba `/api/health`: debe mostrar `version: 1.8.0`.
5. En Administración abre **Comunidad inicial**.
6. Mantén activados **Ideas para publicar** y **Recién llegados** durante la primera cohorte.
7. Deja el límite de miembros fundadores en 100 salvo que quieras cambiar el tamaño de la primera cohorte.
8. Antes de invitar usuarios reales, elimina los datos TEST desde el Laboratorio.

La migración de base de datos es automática al arrancar.
