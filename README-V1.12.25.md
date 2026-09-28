# Instant Admirers V1.12.25 — Virtual Profile Packs

Esta versión parte de **V1.12.24 — Virtual Profile Image System** y completa la estructura de pack para los **99 anfitriones virtuales restantes**.

## Qué hace

Cada anfitrión virtual, salvo Lucía V. que conserva su pack fotográfico piloto de V1.12.24, queda sincronizado con un pack administrable de **6 recursos**:

1. avatar;
2. portada;
3. Café y conversación;
4. Escapada y aire libre;
5. Música y planes;
6. Atardecer y ciudad.

Los cuatro recursos de publicaciones reutilizan las escenas sintéticas que ya existían en la comunidad virtual y ahora quedan correctamente registrados en `virtual_profile_media`, con etiquetas, ALT, orden, estado, destacado e historial de uso. Avatar y portada pasan igualmente por el sistema `/media/{id}` cuando el perfil todavía conserva los recursos base.

## Importante sobre el aspecto visual

Los 99 packs añadidos en esta versión son **packs base sintéticos/ilustrados**, no 594 fotografías humanas nuevas. La versión deja todos los personajes completos dentro del sistema de packs y preparados para sustituir cualquier recurso por fotografías sintéticas realistas desde Administración sin romper publicaciones ni SEO.

Lucía V. sigue siendo el perfil piloto con el pack fotográfico realista de seis imágenes de V1.12.24.

## Administración

En **Administración → Comunidad virtual** se añaden:

- contador de packs completos;
- contador total de recursos de pack;
- botón **Sincronizar packs de imágenes**;
- sincronización idempotente al arrancar la aplicación.

La sincronización no duplica imágenes y puede ejecutarse de nuevo con seguridad.

## Manifest

`VIRTUAL-PROFILE-PACKS-V1.12.25.json` documenta los 99 packs restantes y sus 594 recursos, con ciudad, edad, profesión, intereses, etiquetas y rutas base.

## Despliegue

1. Subir V1.12.25 sobre V1.12.24.
2. Esperar a Render.
3. Comprobar `/api/health` → `1.12.25`.
4. Entrar en Administración → Comunidad virtual.
5. Verificar `100 packs completos` y alrededor de `600 imágenes en packs` (si los 100 perfiles siguen activos y Lucía conserva su piloto).
6. Abrir varios perfiles al azar → Imágenes y comprobar avatar + portada + 4 escenas.

No hay variables de entorno nuevas ni migración SQL manual.
