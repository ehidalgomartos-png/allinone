# Actualizar Instant Admirers a V1.9.0 — Growth Engine

1. Haz una copia de seguridad del repositorio actual si lo deseas.
2. Sustituye en el mismo repositorio GitHub los archivos por los de este ZIP.
3. Haz commit en `main`. Render desplegará automáticamente.
4. No cambies PostgreSQL, Cloudinary, Resend ni los dominios. El esquema V1.9 se crea automáticamente al arrancar.
5. Comprueba `https://instantadmirers.com/api/health`: debe mostrar `version: 1.9.0`.
6. En Administración abre **Growth Engine**.
7. Crea una campaña, por ejemplo: nombre `Página 16K`, canal `Facebook`, perfil destino tu usuario. El enlace se copiará automáticamente.
8. Mantén activo **Acceso a mi perfil** en el perfil destino. Para la primera prueba recomendamos 3 invitaciones y sin exigir publicación, hasta tener datos reales de conversión.
9. Abre el enlace de campaña en incógnito y comprueba: visita -> registro -> perfil bloqueado -> reto -> compartir.

## Qué mide V1.9
- Visitas agregadas al enlace de campaña.
- Registros atribuidos a la campaña.
- Retos de acceso iniciados.
- Acciones de compartir/copiar enlace.
- Altas referidas para el reto.
- Desbloqueos completados.

La atribución de campaña es de primera parte y no añade cookies publicitarias de terceros.
