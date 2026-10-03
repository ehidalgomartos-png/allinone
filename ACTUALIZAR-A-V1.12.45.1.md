# Actualizar a V1.12.45.1

1. Partir de V1.12.45.
2. Aplicar el ZIP PATCH sobre el repositorio.
3. Desplegar en Render.
4. Comprobar `/api/health` → `version: "1.12.45.1"`.
5. Abrir `Motor actividad 3.0`; el diagnóstico debe dejar de contar dos veces las Stories `story-only`.
6. Abrir `Salud comunidad` y ejecutar `Escanear ahora` para refrescar cualquier aviso histórico de repetición.

No requiere SQL, reimportación de fotos ni regenerar actividad.
