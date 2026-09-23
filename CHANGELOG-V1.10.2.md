# CHANGELOG — V1.10.2

## Migración segura de notificaciones

- Corregido el fallo de arranque PostgreSQL `23514` sobre `notifications_type_check`.
- Las restricciones históricas de `notifications.type` dejan de estrechar temporalmente los tipos permitidos al reejecutar `schema.sql`.
- Conservación íntegra de las notificaciones existentes; no se eliminan ni convierten filas.
- Actualizados `/api/health`, mensaje de arranque, paquete y caché PWA a V1.10.2.
- Se conservan íntegros el sistema de Publicidad V1.10.0 y la cuenta técnica Administrador de V1.10.1.
