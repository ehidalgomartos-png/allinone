# Render — OmniSocial V0.5

La V0.5 está preparada para actualizar el servicio existente.

## Configuración del Web Service

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`

Variables necesarias:

- `DATABASE_URL` — ya enlazada a `omnisocial-db`
- `JWT_SECRET` — ya creada en Render
- `NODE_ENV=production`

No hace falta crear otro Blueprint ni otra base de datos.

## Si falla el despliegue

Revisa primero que GitHub contenga:

- `src/db.js`
- `src/schema.sql`
- `public/app.js`
- `public/styles.css`
- `server.js`

Luego abre los Logs del último deploy y localiza la primera línea que empiece por `Error:`.
