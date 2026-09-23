# Instant Admirers V1.11.0 — Español / English

Esta versión parte de **V1.10.4** y añade una capa bilingüe real a Instant Admirers sin perder ninguna de las funciones anteriores.

## Idioma automático
- En la primera visita se utiliza el idioma preferido del navegador.
- Si el navegador usa español, la interfaz arranca en **Español**.
- Para inglés y otros idiomas, la interfaz arranca en **English**.
- La detección no depende de la IP ni de la ubicación geográfica, por lo que funciona mejor con viajes, VPN y dispositivos configurados en otro idioma.

## Selector ES / EN
- El usuario puede cambiar manualmente entre **ES** y **EN**.
- La elección se guarda en `localStorage` para visitantes anónimos.
- Cuando existe sesión, la preferencia se sincroniza también con la cuenta (`users.preferred_language`).
- La preferencia de la cuenta permite conservar el idioma al volver a entrar en otros dispositivos una vez seleccionada.

## Interfaz traducida
Se ha preparado la traducción de las áreas principales y de sus textos dinámicos: acceso y registro, navegación, feed, perfiles, Personas, seguidores/siguiendo, mensajes, actividad, privacidad, ajustes, onboarding, administración, publicidad, avisos, errores y PWA/offline.

El contenido escrito por los usuarios (publicaciones, comentarios, mensajes y demás contenido social) **no se traduce automáticamente**.

## Publicidad bilingüe
Cada anuncio propio puede disponer de copia independiente en español e inglés:
- título visible;
- texto visible;
- texto del botón;
- texto alternativo de accesibilidad.

Si una copia inglesa se deja vacía, Instant Admirers utiliza automáticamente la copia española como respaldo. La imagen, enlace, segmentación, dispositivos, posiciones y estadísticas siguen siendo comunes al anuncio.

## Páginas legales en inglés
Se incluyen versiones en inglés de:
- `/en/legal/`
- `/en/privacy/`
- `/en/cookies/`
- `/en/terms/`
- `/en/community-guidelines/`

Las páginas españolas se mantienen en sus URLs existentes. El selector de idioma lleva a la versión equivalente y el sitemap incluye ambos idiomas.

## Emails de cuenta
Los emails de verificación, recuperación de contraseña y confirmación de cambio de email se envían en español o inglés según la preferencia guardada del usuario.

## Base de datos
La actualización añade automáticamente:
- `users.preferred_language`;
- campos ingleses de título, texto, botón y alt de publicidad.

No es necesario ejecutar SQL manualmente.
