# Actualizar de V1.12.40 a V1.12.40.1

1. Parte únicamente de la V1.12.40 estable.
2. Sube el ZIP PATCH sobre el repositorio o sustituye por el ZIP completo.
3. Despliega en Render normalmente. No requiere SQL manual ni nuevas variables de entorno.
4. Comprueba `/api/health`: debe mostrar `version: "1.12.40.1"` y la feature `virtual-mass-username-folder-fix`.
5. En Administración → Comunidad virtual, el importador masivo debe seguir mostrando historial y rollback existentes.
6. Para comprobar el hotfix puedes subir un ZIP de prueba usando carpetas con usernames exactos. No hace falta confirmar el reemplazo para validar la asignación en preview.

La importación V4 REAL ya aplicada no se modifica ni se vuelve a ejecutar con este hotfix.
