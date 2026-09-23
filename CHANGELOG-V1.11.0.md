# Changelog V1.11.0

- Añadido sistema bilingüe Español / English.
- Detección inicial del idioma mediante preferencias del navegador.
- Inglés como fallback para navegadores que no estén configurados en español.
- Añadido selector ES / EN en acceso, aplicación, páginas legales y ajustes.
- Preferencia de idioma persistida localmente y sincronizada con la cuenta.
- Añadido `preferred_language` a usuarios.
- Traducida la interfaz principal, estados, avisos, errores y contenido administrativo.
- Protegido el contenido generado por usuarios para no traducirlo automáticamente.
- Añadidas copias publicitarias independientes en ES y EN con fallback al español.
- Añadidas páginas legales completas bajo `/en/` y enlaces SEO `hreflang`.
- Ampliado `sitemap.xml` con las páginas legales inglesas.
- Emails de verificación, recuperación y cambio de email adaptados al idioma de la cuenta.
- Página offline bilingüe.
- Reservado el slug `/en` para evitar conflictos con nombres de perfil.
- Manifest PWA neutralizado para no declarar la aplicación exclusivamente en español.
- Caché PWA y `/api/health` actualizados a `1.11.0`.
