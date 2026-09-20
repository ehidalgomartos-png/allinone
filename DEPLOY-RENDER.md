# Render — OmniSocial V0.6

La configuración de Render es la misma que ya utilizabas.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Base de datos: PostgreSQL existente `omnisocial-db`
- Variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`

V0.6 añade Socket.IO. No necesita variables de entorno nuevas.

Render admite la conexión HTTP/WebSocket desde el mismo Web Service, por lo que no hay que crear otro servicio.

Tras desplegar, prueba `/api/health` y después dos sesiones simultáneas para comprobar mensajería y presencia.
