# Instant Admirers V1.10.1 — Administrador como cuenta técnica

Esta versión parte de **V1.10.0 — Sistema de Publicidad** y mantiene íntegro su funcionamiento.

## Objetivo

La cuenta de Administración deja de participar como una cuenta social normal. Se considera una **cuenta técnica del sistema**.

## Comportamiento social

Las cuentas con `role='admin'` y las direcciones incluidas en `ADMIN_EMAILS` quedan marcadas automáticamente como `social_hidden`.

No aparecen en:

- Descubrir.
- Para ti.
- Personas para ti / sugerencias.
- Búsqueda de personas.
- Seguidores y Siguiendo.
- Amigos y solicitudes.
- Solicitudes de seguimiento.
- Stories y Reels.
- Tendencias y publicaciones visibles.
- Conversaciones y mensajería social.
- Actividad / notificaciones sociales.
- Selección de perfiles para segmentación publicitaria.
- Selección de perfiles sociales del Growth Engine.
- Métricas de miembros normales de la comunidad.

El perfil técnico tampoco se puede abrir como perfil social público ni desde otra cuenta autenticada.

## Acciones sociales desactivadas

La cuenta técnica no puede crear nuevas publicaciones, republicar, dar Me gusta, comentar, guardar publicaciones, crear Stories, seguir usuarios, enviar solicitudes de amistad, iniciar conversaciones, enviar mensajes, silenciar, bloquear o denunciar perfiles.

Desde la interfaz, la cuenta técnica deja de mostrar los controles sociales principales: Perfil propio, Publicar, Mensajes, Actividad y Guardados. Conserva Inicio, Reels, Descubrir y Buscar para poder revisar el funcionamiento de la comunidad, además del panel de Administración.

## Limpieza automática al arrancar

En el primer arranque de V1.10.1 se eliminan las relaciones sociales históricas en las que participe una cuenta técnica:

- follows y solicitudes de seguimiento;
- amistades y solicitudes de amistad;
- bloqueos y silencios;
- conversaciones privadas;
- notificaciones sociales emitidas por la cuenta técnica;
- likes, guardados y visualizaciones de Stories;
- segmentaciones publicitarias que apunten a la cuenta técnica.

Las campañas de Growth Engine dirigidas específicamente a una cuenta técnica quedan desactivadas.

Las publicaciones o comentarios históricos de la cuenta Administrador **no se borran físicamente**: simplemente dejan de aparecer en las superficies sociales normales. Así pueden conservarse para revisión administrativa sin convertir la cuenta en un perfil social.

## Base de datos

Se añade de forma automática:

```sql
users.social_hidden BOOLEAN NOT NULL DEFAULT FALSE
```

No hace falta ejecutar una migración manual: `src/schema.sql` y el arranque de la aplicación realizan la actualización.

## Publicidad V1.10.0

Todo el sistema de publicidad de V1.10.0 se mantiene: imágenes, URL, AdSense, ubicaciones, fechas, métricas, segmentación por perfiles y ausencia total de huecos cuando no existe publicidad aplicable.
