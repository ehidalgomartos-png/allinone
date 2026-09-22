# Actualizar Instant Admirers de V1.6.1 a V1.7.0

## Qué añade V1.7

- Centro de lanzamiento con checklist técnico y de producto.
- Fases: Prelanzamiento, Cohorte inicial y Público.
- Objetivo configurable para la primera cohorte.
- Embudo de activación de usuarios reales.
- Enlace de invitación inicial para administración.
- Aviso opcional de fase visible dentro de la app.
- Bloqueo visual de preparación si siguen existiendo perfiles TEST o errores recientes.
- Actualización de la caché PWA a V1.7.0.

## Actualización

1. Sustituye los archivos del repositorio por los de este ZIP.
2. Haz commit en `main`.
3. Espera el deploy automático de Render.
4. No cambies variables de Render, PostgreSQL, Cloudinary ni Resend.
5. Abre `/api/health` y comprueba `version: 1.7.0`.
6. Entra en Administración > Centro de lanzamiento.
7. Si el laboratorio sigue activo, usa **Eliminar datos TEST** antes de abrir a usuarios reales.
8. Para la primera cohorte recomendamos `Solo invitación` + fase `Cohorte inicial`; cuando decidas abrir a todos, cambia a `Abierto` + fase `Público`.

Las nuevas columnas de `launch_settings` se crean automáticamente al arrancar.
