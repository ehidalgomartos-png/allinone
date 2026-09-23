# Actualizar Instant Admirers a V1.9.1 — Gestión de usuarios

1. Sustituye los archivos de V1.9.0 por los de este ZIP en el mismo repositorio de GitHub.
2. Haz commit en `main` y espera el despliegue automático de Render.
3. No cambies PostgreSQL, Cloudinary, Resend ni los dominios. No hay migración manual.
4. Comprueba `https://instantadmirers.com/api/health`: debe mostrar `version: 1.9.1`.
5. Entra en **Administración → Gestión de usuarios**.

## Prueba recomendada

- Busca una cuenta de prueba real por nick o email.
- Comprueba que puedes suspenderla/reactivarla.
- Pulsa **Eliminar**. El sistema exige escribir exactamente el nick y una segunda confirmación.
- Tras eliminarla, comprueba que desaparece del listado y que las métricas se actualizan.

## Protecciones

- No puedes eliminar tu propia cuenta desde Administración.
- Las cuentas con permisos de administración están protegidas.
- La eliminación borra en cascada el contenido y relaciones de esa cuenta y limpia su multimedia de Cloudinary.
- La acción queda registrada en el historial de moderación.
