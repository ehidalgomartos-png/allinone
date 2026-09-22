# Actualizar Instant Admirers V1.7.0 → V1.7.1

V1.7.1 corrige el error PostgreSQL `42P08: inconsistent types deduced for parameter $2` al guardar el Centro de lanzamiento.

## Qué cambia
- Corregido el guardado conjunto de **Registro** y **Fase**.
- Ya se puede seleccionar `Solo invitación` + `Cohorte inicial` sin error 500.
- No hay migraciones de base de datos ni cambios en Render, Cloudinary o Resend.
- Cache PWA renovada a V1.7.1.

## Actualización
1. Sustituye los archivos de V1.7.0 por los de este ZIP en el mismo repositorio.
2. Haz commit en `main` y espera el deploy automático de Render.
3. Abre `/api/health` y confirma `version: 1.7.1`.
4. En Administración → Centro de lanzamiento selecciona:
   - Registro: **Solo invitación**
   - Fase: **Cohorte inicial**
   y guarda/aplica.
5. Debe guardarse sin `Error interno del servidor`.

No ejecutes comandos SQL manuales.
