# Actualizar de V1.12.40.1 a V1.12.41

1. Sube el contenido del **ZIP PATCH** sobre tu repositorio actual V1.12.40.1, o sustituye el proyecto por el ZIP completo.
2. Haz commit/push a GitHub y deja que Render despliegue normalmente.
3. No ejecutes SQL manual. Al iniciar, `src/schema.sql` crea `virtual_visual_actions` e índices asociados.
4. Comprueba `/api/health`: debe devolver `version: "1.12.41"` y las features `virtual-visual-manager-2` y `virtual-visual-last-change-rollback`.
5. En **Administración → Comunidad virtual**, abre cualquier perfil y pulsa **Gestión visual**.

## Prueba recomendada

- Abre un perfil virtual y comprueba que aparecen sus 6 fotos V4 activas.
- Reordena dos fotos de post y comprueba que aparece la acción en el historial.
- Pulsa **Deshacer último cambio** y verifica que vuelve el orden anterior.
- Para probar sustitución, usa primero una foto de prueba en un perfil y deja activado **Reenlazar historial al sustituir**. Verifica el resultado antes de repetirlo en otros perfiles.

La importación masiva V4 ya activa **no debe repetirse** para instalar esta versión.
