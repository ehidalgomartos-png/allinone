# Changelog V1.7.1

- Fix PostgreSQL 42P08 en `/api/admin/launch/settings`.
- Separado el parámetro usado para `launch_phase` del parámetro usado para detectar la transición a fase pública, evitando la inferencia incompatible `text` vs `character varying`.
- Añadida feature `launch-settings-type-fix`.
- Cache PWA actualizada a V1.7.1.
