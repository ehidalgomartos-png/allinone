# Instant Admirers V1.12.42

## Centro de Calidad de Perfiles Virtuales

V1.12.42 parte de **V1.12.41 — Gestión visual de perfiles virtuales 2.0** y añade un diagnóstico global, de solo lectura, para los 100 perfiles virtuales.

### Qué revisa

- Avatar y portada presentes y enlazados a una imagen activa del pool.
- Medios activos con `provider_status=ready`.
- Cantidad total de imágenes activas y variedad de fotos de publicación.
- Duplicados exactos por SHA-256, dentro de un perfil o entre perfiles distintos.
- Imágenes de baja resolución cuando el proveedor informa dimensiones.
- Publicaciones y Stories que apunten a medios no disponibles.
- Imágenes archivadas que todavía conserven referencias históricas.
- Imágenes activas sin huella SHA-256, que no pueden compararse con precisión.
- Riesgo de actividad automática cuando el pool visual tiene poca variedad.

### Interfaz

En **Administración → Comunidad virtual** aparece el botón **🩺 Centro de calidad**.

El panel muestra:

- Semáforo: Correcto / Revisar / Crítico.
- Puntuación técnica 0–100 por perfil.
- Resumen global de 100 perfiles e imágenes activas.
- Filtros por estado y buscador por nombre, username o ciudad.
- Acceso directo a **Gestión visual** y al perfil público.
- Botón **Reanalizar**.
- Exportación del diagnóstico completo en JSON.

El escáner **no modifica imágenes ni referencias**. Las correcciones se hacen desde Gestión visual 2.0.

### Despliegue

No requiere SQL manual ni variables de entorno nuevas. El esquema V1.12.41 sigue siendo compatible.

Tras desplegar, `/api/health` debe devolver `version: "1.12.42"` y las features `virtual-quality-center`, `virtual-quality-broken-reference-scan`, `virtual-quality-duplicate-scan` y `virtual-quality-low-resolution-scan`.
