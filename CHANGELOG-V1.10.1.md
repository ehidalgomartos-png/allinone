# CHANGELOG — V1.10.1

## Administrador como cuenta técnica

- Añadido `users.social_hidden`.
- Las cuentas `role='admin'` o incluidas en `ADMIN_EMAILS` se sincronizan automáticamente como cuentas técnicas.
- Excluidas de Descubrir, Para ti, sugerencias, búsqueda, seguidores, siguiendo, amistades, solicitudes, Stories, Reels, tendencias, mensajes, notificaciones y métricas sociales.
- El perfil Administrador ya no se resuelve como perfil social público o autenticado.
- Bloqueadas las acciones sociales de una cuenta técnica mediante middleware de servidor.
- Eliminados de la interfaz del Administrador los principales controles de una cuenta social normal.
- Añadida tarjeta “Cuenta técnica” en la columna derecha del Administrador.
- Eliminada la creación automática de follows desde Administrador en Demo Lab.
- Segmentación de publicidad y Growth Engine impiden seleccionar una cuenta técnica como perfil social objetivo.
- Limpieza automática de relaciones sociales antiguas del Administrador al iniciar la aplicación.
- Las publicaciones y comentarios históricos de Administrador se conservan en base de datos pero quedan fuera de las superficies sociales.
- Actualizada PWA y caché estática a V1.10.1.
