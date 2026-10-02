# Actualizar a V1.12.44

1. Parte de V1.12.43.
2. Sube el PATCH a GitHub y despliega en Render.
3. No hay SQL manual ni variables de entorno nuevas: `src/schema.sql` crea `virtual_community_health_scans`.
4. Comprueba `/api/health` → `version: "1.12.44"`.
5. En Administración → Comunidad virtual abre `❤ Salud comunidad`.
6. Pulsa `Escanear ahora` para crear el primer registro manual.

El escáner no modifica datos sociales ni fotografías.
