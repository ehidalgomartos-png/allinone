# Instant Admirers V1.12.17 — SEO Public Profiles

Parte de V1.12.16 y añade SEO automático a los perfiles que hayan activado **Vista previa pública de mi perfil**.

## Incluye
- HTML renderizado en servidor para `/usuario`, con `title`, meta description y canonical propios.
- Open Graph y Twitter Cards automáticos.
- JSON-LD `ProfilePage` + `Person`, con estadísticas de publicaciones/seguidores cuando existen.
- `sitemap-profiles.xml` dinámico: sólo perfiles activos, públicos, no demo y con vista previa pública activada.
- `sitemap.xml` referencia el nuevo sitemap dinámico.
- Hub `/perfiles/` con enlaces internos rastreables.
- Enlaces a `/perfiles/` desde las 40 landings SEO y sus hubs.
- Perfiles privados/desactivados/campañas parametrizadas: `noindex`.
- El HTML SEO de posts muestra sólo texto; las fotos y vídeos de las publicaciones siguen bloqueados y sus URLs no se imprimen en la página.
- Corrección del Service Worker para que una landing/perfil dinámico no sustituya accidentalmente el shell offline de la PWA.

No añade campos de Título SEO ni Descripción SEO al perfil: ambos se generan automáticamente.

No requiere nuevas variables de Render ni migración manual.
