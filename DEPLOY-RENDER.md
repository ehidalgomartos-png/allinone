# Render — OmniSocial V0.9

Esta versión se despliega sobre el mismo servicio y la misma base PostgreSQL de las versiones anteriores.

1. Sube V0.9 al repositorio GitHub conectado a Render.
2. Render ejecutará `npm install` y `npm start`.
3. `src/schema.sql` aplicará las migraciones al iniciar.
4. Comprueba `/api/health` y que la versión sea `0.9.0`.

No crees otra base de datos y no elimines `DATABASE_URL` ni `JWT_SECRET`.
