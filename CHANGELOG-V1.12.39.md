# CHANGELOG V1.12.39 — Descubrir 2.0

## Añadido
- `/api/discover/people` con modos `for_you`, `local`, `active` y `new`.
- `/api/discover/people/:id/dismiss` para descartar sugerencias.
- Rotación persistente mediante impresiones por usuario/perfil.
- Diversidad real/virtual en las recomendaciones.
- Badges explicativos de recomendación.
- Ranking personalizado y diverso para publicaciones públicas de Descubrir.

## Cambiado
- Descubrir deja de depender de una única lista fija de personas.
- “Popular ahora” pasa a “Para descubrir”.
- La actividad virtual deja de influir en el ranking social usado por esta pantalla.
- La comparación de ciudad tolera formatos como `Valencia` y `Valencia, España`.
- Se corrigió el separador de intereses en las consultas de recomendación (`\s*,\s*`).

## Base de datos
- Nueva tabla `discovery_profile_impressions`.
- Nueva tabla `discovery_profile_dismissals`.
