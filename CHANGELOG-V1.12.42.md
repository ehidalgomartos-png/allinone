# CHANGELOG V1.12.42 — Centro de Calidad de Perfiles Virtuales

## Añadido

- Endpoint admin `GET /api/admin/virtual-community/quality`.
- Diagnóstico global para todos los perfiles virtuales.
- Semáforo por perfil: `ok`, `warning`, `critical`.
- Puntuación técnica de calidad.
- Detección de avatar/portada ausentes, archivados o fuera del pool.
- Detección de medios activos no disponibles.
- Detección de referencias rotas en posts y Stories.
- Detección de duplicados exactos mediante SHA-256.
- Detección de duplicados dentro de un mismo perfil y entre perfiles.
- Detección de baja resolución cuando existen dimensiones fiables.
- Aviso de imágenes archivadas todavía referenciadas.
- Aviso de imágenes sin SHA-256.
- Aviso de actividad automática con poca variedad visual.
- Panel global con filtros, búsqueda, reanálisis y exportación JSON.
- Acceso directo desde cada incidencia a Gestión visual 2.0.

## Seguridad

- El Centro de Calidad es de solo lectura.
- No reemplaza, archiva, borra ni reenlaza imágenes automáticamente.
- Todas las correcciones siguen pasando por las operaciones seguras de V1.12.41.

## Compatibilidad

- Mantiene V1.12.41 y el importador masivo V1.12.40.1.
- No modifica el esquema de base de datos.
- No requiere variables nuevas.
