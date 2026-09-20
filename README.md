# OmniSocial V0.9 — Privacidad y control

V0.9 añade una capa de privacidad sobre la comunidad propia construida hasta V0.8.

## Novedades

- Cuentas públicas o privadas.
- Solicitudes de seguimiento para cuentas privadas.
- Aceptar o rechazar solicitudes desde Privacidad.
- Si una cuenta vuelve a pública, las solicitudes pendientes se convierten en seguidores.
- Bloquear / desbloquear usuarios.
- Silenciar / volver a mostrar usuarios.
- Denunciar perfiles y publicaciones.
- Control de mensajes: todo el mundo, seguidores, amigos o nadie.
- Feeds, Stories, Reels, búsqueda, recomendaciones y tendencias respetan bloqueos y privacidad.
- El contenido de cuentas privadas solo se muestra a seguidores aprobados.
- Los bloqueos eliminan seguimiento, solicitudes de seguimiento, amistad y solicitudes de amistad entre ambas personas.
- Los mensajes nuevos respetan bloqueo y política de mensajes.

## Migración

`src/schema.sql` usa migraciones aditivas con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS`. No borra usuarios, publicaciones, mensajes, Stories, Reels ni relaciones existentes.

Nuevas tablas:

- `follow_requests`
- `blocks`
- `mutes`
- `reports`

Nuevos campos en `users`:

- `account_private`
- `message_policy`

## Desarrollo local

1. Configura `DATABASE_URL` y `JWT_SECRET`.
2. Ejecuta `npm install`.
3. Ejecuta `npm start`.
4. Abre `http://localhost:3000`.

## Render

Mantén el mismo Web Service y la misma base PostgreSQL. Al desplegar, `initDb()` aplica las migraciones automáticamente.

Comprueba `/api/health`; debe indicar `version: "0.9.0"`.

## Nota de moderación

Las denuncias ya se guardan en PostgreSQL con estado `open`. El panel administrativo para revisar y resolver denuncias queda preparado como evolución posterior; V0.9 se centra en las herramientas del usuario.
