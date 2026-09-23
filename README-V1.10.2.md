# Instant Admirers V1.10.2 — Migración segura de notificaciones

Esta versión parte de **V1.10.1 — Administrador como cuenta técnica del sistema** y conserva todos sus cambios.

## Corrección principal

`src/schema.sql` se ejecuta en cada arranque. Las migraciones históricas de la tabla `notifications` volvían a crear temporalmente `notifications_type_check` con listas antiguas y más cortas de tipos permitidos.

Si la base ya contenía notificaciones modernas como `mention`, `repost`, `follow_request` o `follow_accept`, PostgreSQL podía detener el arranque con el error `23514` indicando que `notifications_type_check` era violada por alguna fila.

V1.10.2 hace esas restricciones **idempotentes**: todos los pasos históricos usan desde el principio el conjunto actual de tipos permitidos. No se borran ni transforman notificaciones existentes.

## Tipos admitidos

- `follow`
- `like`
- `comment`
- `friend_request`
- `friend_accept`
- `message`
- `mention`
- `repost`
- `follow_request`
- `follow_accept`

## Resultado esperado

Render debe completar `npm start`, mostrar `Instant Admirers V1.10.2` y `/api/health` debe devolver `"version":"1.10.2"`.
