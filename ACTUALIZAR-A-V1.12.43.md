# Actualizar a V1.12.43

Partiendo de **V1.12.42.1**:

1. Sube el contenido del ZIP PATCH a GitHub sustituyendo los archivos indicados.
2. Despliega en Render.
3. No ejecutes SQL manual ni cambies variables de entorno.
4. Comprueba `/api/health` → `version: "1.12.43"`.
5. En Administración → Comunidad virtual debe aparecer `🛡 Vigilancia visual`.
6. Puedes ejecutar `Escanear ahora` para crear el primer registro; si no, el primer ciclo automático se programa tras el arranque.

La vigilancia es de solo lectura y no modifica fotos.
