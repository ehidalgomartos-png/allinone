# Actualizar Instant Admirers a V1.10.2

## Motivo

V1.10.1 puede fallar al arrancar en una base PostgreSQL que ya tenga tipos modernos de notificación porque `schema.sql` reejecuta restricciones históricas demasiado estrechas. V1.10.2 corrige ese comportamiento.

## Pasos

1. Sustituye en el repositorio el contenido por V1.10.2.
2. Haz commit/push y deja que Render despliegue.
3. No ejecutes SQL manual ni borres datos de `notifications`.
4. En los logs debe aparecer `Instant Admirers V1.10.2 en http://localhost:10000`.
5. Comprueba `/api/health`; debe devolver `"version":"1.10.2"`.
6. Prueba después Publicidad y confirma desde una cuenta normal que Administrador sigue fuera de Descubrir, Buscar, Personas y relaciones sociales.

## Base de datos

La corrección es automática y no requiere migración manual. Las notificaciones actuales se conservan.
