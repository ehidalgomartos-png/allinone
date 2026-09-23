# Actualizar a V1.10.3

1. Despliega el proyecto completo sobre V1.10.2.
2. No ejecutes SQL manual: `src/schema.sql` añade las columnas nuevas con `ADD COLUMN IF NOT EXISTS`.
3. Comprueba `/api/health`: debe indicar `version: 1.10.3`.
4. En Administración → Publicidad, edita el anuncio y encontrarás Título visible, Texto visible y Texto del botón.
5. El antiguo Texto alternativo sigue siendo accesibilidad.
