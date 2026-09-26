# Instant Admirers V1.12.16 — Direct Public Profile

Base: **V1.12.15 — Mobile Chat Composer Fix**.

## Qué añade

- Un perfil puede activar desde **Privacidad → Vista previa pública de mi perfil** la vista pública de su URL bonita, por ejemplo `/rubi`.
- Un visitante sin sesión puede ver cabecera, avatar, nombre, usuario, frase, biografía y el texto de las publicaciones públicas.
- Las fotos y vídeos de las publicaciones **no se entregan al navegador del visitante**. En su lugar aparece el bloqueo de alta ya usado en Growth Engine.
- Los botones `Crear cuenta` conservan el destino del perfil. Tras registro/login se vuelve a ese perfil.
- Una alta iniciada desde `/usuario` queda atribuida al propietario del perfil como referido con origen interno `direct_profile`.
- Si el modo global está en **Solo invitación**, una vista pública directa activa también proporciona una invitación válida del propietario para ese registro.
- Las cuentas privadas nunca muestran esta vista aunque el interruptor quede guardado.
- Growth Engine mantiene exactamente su comportamiento anterior y sus campañas siguen decidiendo de forma independiente si permiten teaser público.

## Seguridad

El endpoint público sólo devuelve texto y metadatos mínimos (`has_media` y tipo imagen/vídeo). No devuelve `media_id`, `external_url`, URLs Bunny ni URLs firmadas de la multimedia de los posts.

## Base de datos

Migración automática e idempotente:

- `users.public_profile_preview_enabled BOOLEAN DEFAULT FALSE`
- `referral_attributions.source VARCHAR(30) DEFAULT 'invite'`

No hay SQL manual.
