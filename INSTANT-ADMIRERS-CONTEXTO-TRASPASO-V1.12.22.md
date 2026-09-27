# Instant Admirers — Contexto de traspaso V1.12.22

## Base
V1.12.22 — Virtual Profiles SEO, derivada de V1.12.21 Virtual Community.

## Función nueva
Los 100 anfitriones virtuales pueden formar parte del SEO público, manteniendo divulgación clara de que son personajes ficticios gestionados por Instant Admirers.

## SEO virtual
- incluidos en `sitemap-profiles.xml` si están activos/no ocultos, públicos y con preview habilitada;
- incluidos en `/perfiles/`;
- HTML SSR en `/{username}`;
- title/meta específicos;
- JSON-LD con divulgación;
- insignia visible `Perfil virtual`;
- teaser público con `is_virtual`;
- perfiles retirados fuera de sitemap/hub/SSR indexable.

## Migración
`schema.sql` actualiza de forma idempotente los virtuales ya creados para activar `public_profile_preview_enabled=TRUE` y `account_private=FALSE`, siempre que sigan activos y no ocultos. No recrear los perfiles.

## Métricas
Los anfitriones continúan excluidos de métricas de usuarios reales, readiness y crecimiento real.

## Despliegue
Comprobar `/api/health` = `1.12.22`, después `/sitemap-profiles.xml`, `/perfiles/` y una URL de anfitrión en incógnito.
