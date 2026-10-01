# V1.12.37.1 — Activity Grouping Hotfix

## Cambios

- Agrupa los **Me gusta de una misma persona sobre varias publicaciones** en una sola entrada de Actividad, por ejemplo: `Pedro ha indicado que le gustan 8 de tus publicaciones`.
- Mantiene la agrupación de varias personas sobre una misma publicación cuando corresponde.
- Al pulsar **Ver publicaciones** se abre una lista compacta de las publicaciones afectadas y desde ahí se puede abrir cada una.
- Agrupa varios **nuevos seguidores** en una sola entrada cuando llegan dentro de la misma sección temporal.
- Al pulsar **Ver perfiles** se abre la lista de las personas que empezaron a seguirte.
- Los comentarios, menciones, solicitudes y demás acciones que requieren contexto individual se siguen mostrando por separado.
- Se eliminan avatares/nombres duplicados dentro de una misma agrupación.
- La identificación **Virtual** se conserva correctamente incluso cuando varias interacciones del mismo perfil virtual quedan agrupadas.
- En móvil, los botones superiores de Actividad pasan a una barra horizontal compacta con desplazamiento, evitando botones altos de varias líneas.
- Se acortan los textos de `Avisos del navegador` y `Marcar todo leído` para mejorar el espacio disponible.
- Se actualiza el versionado de caché/PWA para forzar la carga de los nuevos JS/CSS.

## Base de datos

No hay cambios de esquema ni migraciones.

## Compatibilidad

Parte directamente de **V1.12.37** y conserva Centro de actividad 2.0, notificaciones sociales por email, Comentarios/Likes, Interacción virtual 2.0, Actividad virtual 2.0 y el resto de funciones existentes.
