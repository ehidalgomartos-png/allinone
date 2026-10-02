# CHANGELOG V1.12.40.1 — Mass Import Username Hotfix

Hotfix sobre la V1.12.40 estable.

## Corregido

- El importador masivo ya reconoce correctamente carpetas nombradas con el username exacto del perfil, por ejemplo `lucia.vidal.01/` o `adrian.ferrer.59/`.
- Se corrige una falsa ambigüedad interna: el username literal y su variante normalizada podían generar dos alias equivalentes para el mismo usuario y el resolver descartaba ambos.
- Los alias ahora se deduplican por `user_id`; solo se consideran ambiguos cuando una misma clave realmente apunta a perfiles distintos.
- Se mantiene intacto el soporte para carpetas numéricas `001`–`100`.
- No hay cambios en commit atómico, staging, historial, rollback, reenlace histórico ni almacenamiento de las fotos ya importadas.

## Regresión comprobada

- ZIP sintético con 100 carpetas numéricas: 100 perfiles / 300 imágenes asignadas.
- ZIP sintético con 100 usernames reales: 100 perfiles / 300 imágenes asignadas.
- El primer ZIP real por username que fallaba en V1.12.40 vuelve a utilizarse como prueba de regresión del hotfix.
