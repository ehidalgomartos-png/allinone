# Actualizar Instant Admirers V1.2.9 → V1.2.10

1. No borres Render ni PostgreSQL.
2. Sustituye los archivos del mismo repositorio por los de este ZIP.
3. Haz commit en `main` y espera al Auto Deploy de Render.
4. Comprueba `/api/health`: debe indicar `1.2.10`.

## Prueba recomendada

- Perfil → Editar perfil.
- Pulsa **Cambiar foto** y selecciona una imagen: debe aparecer inmediatamente en el círculo de previsualización.
- Pulsa **Cambiar portada** y selecciona una imagen: debe aparecer inmediatamente en la cabecera del editor.
- Pulsa **Guardar cambios** y confirma que ambas siguen visibles al volver al perfil.
