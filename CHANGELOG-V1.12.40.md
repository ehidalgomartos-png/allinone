# CHANGELOG V1.12.40 — Importador Masivo 100 Perfiles

- Nuevo importador masivo para los 100 perfiles virtuales desde un único ZIP.
- Admite hasta 2.000 imágenes en total, entre 3 y 30 imágenes por perfil.
- Estructura automática por carpetas `001`–`100` o por `username`; no requiere 100 manifests.
- Detección automática de avatar, portada y fotos de post. Se recomienda nombrar `avatar.*` y `cover.*`; si no existen, usa las dos primeras imágenes por orden natural y lo muestra como aviso.
- Validación completa antes de reemplazar nada: estructura ZIP, rutas seguras, 100 perfiles presentes, asignación inequívoca, tamaños, formatos JPG/PNG/WEBP, firma binaria de cada imagen y rechazo de duplicados exactos dentro de un mismo perfil.
- El ZIP se guarda temporalmente en disco para no cargar cientos de MB en RAM.
- Staging remoto previo: todas las imágenes nuevas se preparan antes del cambio final.
- Progreso por fases: subida, validación, staging, preview, commit y rollback.
- Preview de los 100 perfiles antes de confirmar.
- Commit atómico: avatar, portada, pool activo y referencias históricas se actualizan dentro de una única transacción PostgreSQL.
- Snapshot completo del estado anterior antes del commit.
- Rollback desde el historial: restaura avatar, portada, pool de imágenes y referencias exactas de posts/Stories reenlazadas. Los rollbacks se encadenan de forma segura: una importación anterior no puede pisar otra posterior que siga aplicada.
- Historial de importaciones masivas con estado, recuentos, progreso y errores.
- Cancelación segura del staging sin tocar las fotos actuales, con exclusión mutua frente a Confirmar/rollback para evitar carreras administrativas.
- Las fotos antiguas se retiran del pool activo únicamente al confirmar. Se conservan archivadas mientras el rollback esté disponible; no se destruyen físicamente durante ese periodo.
- Recuperación tras reinicio: una importación interrumpida durante validación/staging queda marcada como fallida para reintento, sin aplicar cambios parciales.
- Límite de ZIP masivo configurable con `MAX_VIRTUAL_MASS_ZIP_MB` (900 MB por defecto, máximo 1500 MB).
- PWA/cache y versión de producción actualizados a 1.12.40.
