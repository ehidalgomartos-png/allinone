# Instant Admirers — V1.12.22 — Virtual Profiles SEO

## Objetivo
Hacer indexables los anfitriones virtuales de V1.12.21 sin presentarlos como personas reales.

## Cambios
- Los perfiles virtuales activos y no retirados pasan a tener vista pública habilitada.
- Los perfiles virtuales elegibles aparecen en `/sitemap-profiles.xml`.
- Los perfiles virtuales elegibles aparecen en el hub público `/perfiles/`.
- La ruta pública `/{usuario}` ya puede renderizar HTML SEO para perfiles virtuales.
- Título y meta description específicos para perfiles virtuales.
- JSON-LD `ProfilePage` + `Person` con `disambiguatingDescription` que aclara que es un personaje virtual gestionado por Instant Admirers.
- Aviso visible `✦ Perfil virtual` en el HTML prerenderizado para buscadores y visitantes.
- La vista previa pública antes del registro también muestra el aviso de anfitrión virtual.
- El teaser público devuelve `is_virtual` para conservar la divulgación en cliente.
- Los perfiles retirados siguen fuera del SEO mediante `social_hidden=TRUE`.
- Las métricas de usuarios reales siguen excluyendo perfiles virtuales.
- Service Worker y assets actualizados a V1.12.22.

## Compatibilidad con perfiles ya creados
Al arrancar, `schema.sql` activa `public_profile_preview_enabled=TRUE` y mantiene `account_private=FALSE` para anfitriones virtuales activos/no ocultos ya existentes. No hay que recrear los 100 perfiles.

## Verificaciones
- `npm run check`
- `/api/health` debe devolver `version: 1.12.22`.
- `/sitemap-profiles.xml` debe contener URLs de anfitriones virtuales.
- `/perfiles/` debe mostrar la insignia `✦ Perfil virtual`.
- Al abrir un anfitrión sin sesión, el HTML y el teaser deben declarar que es un personaje ficticio gestionado por Instant Admirers.
