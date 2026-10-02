# Actualizar de V1.12.39.1 a V1.12.40

1. Parte de la V1.12.39.1 estable.
2. Copia el contenido del ZIP PATCH sobre el repositorio, respetando las rutas.
3. Sube los cambios a GitHub y deja que Render despliegue.
4. No hay SQL manual: `src/schema.sql` crea automáticamente las tablas del importador al arrancar.
5. Comprueba `/api/health`: debe mostrar `version: "1.12.40"`.
6. En Administración → Comunidad virtual debe aparecer **Importación masiva · 100 perfiles**.
7. Prepara un ZIP siguiendo `GUIA-ZIP-IMPORTACION-MASIVA-V1.12.40.md`.
8. Sube el ZIP. Durante subida, validación y staging las fotos actuales siguen intactas.
9. Espera a que el estado sea **Preview listo** y revisa las tarjetas de los perfiles.
10. Pulsa **Confirmar reemplazo de los 100 perfiles** solo cuando el preview sea correcto.
11. Verifica varios perfiles, publicaciones antiguas y Stories.
12. Si algo no está bien, abre el historial y usa **Hacer rollback**. Si ya aplicaste otra importación posterior, revierte primero la más reciente.

## Variable opcional

`MAX_VIRTUAL_MASS_ZIP_MB=900`

Solo hace falta cambiarla si quieres otro límite. El código acepta entre 100 y 1500 MB.

## Importante

La importación masiva requiere el almacenamiento remoto de imágenes ya configurado (Bunny Storage en la instalación actual). El sistema no usa PostgreSQL como almacén para un lote masivo.
