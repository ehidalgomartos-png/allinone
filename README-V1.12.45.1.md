# Instant Admirers V1.12.45.1 — Activity 3.0 Diagnostic Hotfix

Hotfix sobre V1.12.45. No cambia el motor de generación ni las publicaciones creadas.

## Corrección

- Corrige un falso positivo del panel `Motor de actividad virtual 3.0`.
- Los eventos `story-only` guardan el caption en `text_hash` y también en `metadata.story_text_hash`.
- V1.12.45 contaba ambas referencias como dos usos del mismo texto, mostrando grupos repetidos que no eran publicaciones repetidas reales.
- El diagnóstico y `Salud comunidad` cuentan ahora cada Story independiente una sola vez.
- No borra ni modifica posts, Stories, fotos ni horarios.

## Resultado esperado para la primera tanda observada

Con 20 eventos: 6 posts de texto + 10 posts con foto + 7 Stories (4 de ellas Story-only), el panel debe mostrar 23 piezas de texto/caption y, si no existen repeticiones reales, 23 únicas, 0 grupos repetidos y 100% de originalidad.

## Despliegue

Aplicar el PATCH sobre V1.12.45 y desplegar en Render. No requiere SQL ni variables nuevas.
