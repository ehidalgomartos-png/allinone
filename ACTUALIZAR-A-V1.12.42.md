# Actualizar de V1.12.41 a V1.12.42

1. Sube los archivos del PATCH sobre tu repositorio actual V1.12.41.
2. Haz commit y deja que Render despliegue la nueva versión.
3. No ejecutes SQL manual y no cambies variables de entorno.
4. Comprueba `/api/health`: debe mostrar `version: "1.12.42"`.
5. Entra en **Administración → Comunidad virtual** y pulsa **🩺 Centro de calidad**.
6. Ejecuta el primer análisis y revisa primero los perfiles marcados como **Crítico** y después **Revisar**.
7. Para corregir una incidencia, abre **Gestión visual** desde la propia fila del perfil.

El análisis no modifica ninguna foto ni referencia existente.
