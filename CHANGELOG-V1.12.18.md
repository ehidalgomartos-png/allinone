# Changelog — Instant Admirers V1.12.18

## Añadido

- Selector global Claro/Oscuro para visitantes y usuarios registrados.
- Persistencia local de la preferencia visual.
- Tema claro completo para la aplicación social.
- Tema claro para perfiles públicos, prerender SEO, `/perfiles/`, landings y páginas legales.
- Tema claro para la página offline.
- Actualización dinámica del color del navegador según el tema.
- Assets de tema incluidos en la caché PWA.

## Conservado

- SEO Public Profiles de V1.12.17.
- Sitemap dinámico de perfiles.
- Protección de multimedia y enlaces Bunny firmados.
- Chat Gate Fix, Chat Responsive Fix y Mobile Chat Composer Fix.
- Growth Engine, campañas, referidos y analítica de procedencia.
- Administración, moderación y publicidad.

## Técnico

- Versión de package: `1.12.18`.
- `/api/health`: `1.12.18`.
- Service Worker: `instant-admirers-v1.12.18`.
- `npm run check` valida también `public/theme.js`.
- Normalizado el bloque CSS heredado del compositor móvil para eliminar secuencias `\n` literales y conservar correctamente el fix responsive del chat.
