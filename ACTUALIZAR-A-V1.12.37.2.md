# Actualizar a V1.12.37.2

Base requerida: **V1.12.37.1**.

1. Sube el contenido del ZIP PATCH sobre la versión V1.12.37.1 en GitHub.
2. Deja que Render despliegue el nuevo commit.
3. Comprueba `/api/health` y confirma `version: "1.12.37.2"`.
4. Haz una recarga completa/PWA para que el nuevo Service Worker renueve los CSS y JS en caché.
5. Comprueba en Actividad una agrupación de varios seguidores y una agrupación de varios Me gusta.
6. Comprueba en cualquier publicación con Me gusta que se vea completo el texto `Le gusta a …`, incluida la primera letra.

No requiere cambios de variables de entorno ni migraciones de base de datos.
