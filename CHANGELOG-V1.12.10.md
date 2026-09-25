# Instant Admirers V1.12.10 — Public Teaser Profile

Base: **V1.12.9 — Video Quality Startup**. No incluye V1.13.0 ni DeepL.

## Cambios
- Growth Engine permite activar **Vista pública del perfil** campaña por campaña.
- En la pantalla de invitación, cabecera y avatar pasan a ser clicables sólo si la campaña lo permite.
- El visitante sin cuenta puede ver cabecera, avatar, nombre, frase, biografía y texto de publicaciones públicas.
- Fotos y vídeos de posts no se entregan al visitante: se sustituyen por un bloqueo con CTA **Crear cuenta para ver el contenido**.
- El CTA conserva `ref`, `invite`, `campaign` y parámetros UTM, y abre directamente **Crear cuenta**.
- Nuevas métricas de Growth Engine: vistas de perfil teaser y clics hacia alta.
- Se mantienen Bunny Storage/Stream, calidad adaptativa V1.12.9, SEO y protección previa.

## Base de datos
Migración idempotente automática: `public_teaser_enabled`, `teaser_views`, `teaser_signup_clicks`.

## Variables
No añade variables de entorno.
