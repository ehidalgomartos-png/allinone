# Actualizar Instant Admirers a V1.12.39

Partir de **V1.12.38**.

## Con PATCH
1. Sustituir en GitHub los archivos incluidos en `Instant-Admirers-V1.12.39-PATCH-GitHub.zip`.
2. Hacer commit/push.
3. Esperar el nuevo despliegue de Render.
4. No ejecutar SQL manual: `schema.sql` crea las tablas nuevas al arrancar.
5. Abrir `/api/health` y verificar `version: "1.12.39"`.
6. Recargar la PWA/web para que el nuevo Service Worker renueve la caché.

## Comprobaciones
- Descubrir muestra filtros **Para ti / Tu ciudad / Activos / Nuevos**.
- **Cambiar** rota las sugerencias.
- `×` oculta una sugerencia.
- **Tu ciudad** funciona si el perfil tiene ciudad.
- Las publicaciones muestran motivos de recomendación y mayor variedad de autores.
