# Actualizar OmniSocial V1.0 → V1.0.1

Esta actualización no modifica PostgreSQL ni borra datos.

## Cambio principal
La barra de progreso de las Stories ahora avanza visualmente. Las fotos duran 6 segundos y los vídeos usan su tiempo real de reproducción. Al terminar, pasa automáticamente a la siguiente Story.

## Archivos que cambian
- `public/app.js`
- `public/styles.css`
- `server.js`
- `package.json`

Sube el contenido del ZIP al mismo repositorio GitHub y deja que Render haga el deploy.

Comprueba después `/api/health`; debe mostrar `"version":"1.0.1"`.
