# Instant Admirers V1.12.37.2 — Activity Visual Polish

Base: **V1.12.37.1 — Activity Grouping Hotfix**.

## Cambios

- Pulido visual del Centro de actividad 2.0.
- Los avatares agrupados de seguidores quedan limitados a 3 visibles, con menos solapamiento y espacio reservado para que no invadan el texto.
- Las agrupaciones de Me gusta destacan mejor el número de publicaciones afectadas y el acceso `Ver publicaciones`.
- Los accesos de agrupaciones de seguidores también quedan más visibles.
- Los encabezados de periodo muestran ahora `1 actividad` / `N actividades` en lugar de un número aislado.
- Corregido el resumen `Le gusta a …` de las publicaciones: el avatar ya no puede montarse encima del comienzo del texto ni comerse la primera letra.
- El resumen de Me gusta utiliza ahora un contenedor independiente para los avatares, manteniendo correctamente el espacio antes del texto tanto con 1 como con 2 avatares.
- Actualización de versión, caché PWA y flags de `/api/health`.

## Sin cambios

- No hay migración de base de datos.
- No cambia la lógica de agrupación introducida en V1.12.37.1.
- No se modifica la actividad virtual, las imágenes, Bunny, Resend ni el sistema de mensajes.
