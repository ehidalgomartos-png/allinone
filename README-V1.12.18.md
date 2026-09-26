# Instant Admirers V1.12.18 — Light / Dark Visitor Theme

Esta versión parte directamente de **V1.12.17 — SEO Public Profiles** y conserva sus funciones y correcciones.

## Novedad principal

Cada visitante puede alternar entre **modo oscuro** y **modo claro** mediante un selector flotante global.

- Oscuro continúa siendo el modo inicial por defecto para mantener la identidad actual.
- La elección se guarda en `localStorage` con la clave `instant_admirers_theme`.
- La preferencia se mantiene al navegar, recargar o volver más adelante desde el mismo navegador.
- El cambio actualiza también `theme-color` y `color-scheme` del documento.
- Funciona sin iniciar sesión y también con una sesión abierta.

## Cobertura del tema claro

El modo claro se aplica a:

- Entrar y Crear cuenta.
- Feed, Stories, perfiles, Descubrir, Personas y notificaciones.
- Chat y compositor móvil.
- Formularios, modales y menús.
- Invitaciones, retos de acceso y Growth Engine.
- Administración y publicidad.
- Perfiles públicos directos y su prerender SEO.
- `/perfiles/`.
- Las landings SEO de ciudades y guías.
- Páginas legales ES/EN.
- Página offline de la PWA.

Los visores de fotos, Stories y Reels mantienen deliberadamente fondos oscuros para no alterar la percepción del contenido multimedia.

## Archivos nuevos

- `public/theme.js`: selección, persistencia y sincronización del tema.
- `public/theme.css`: adaptación visual completa del modo claro y estilo del selector.

## PWA

La caché cambia a `instant-admirers-v1.12.18` e incorpora `theme.js` y `theme.css` al App Shell para que el selector también funcione correctamente tras actualizar la PWA.

## API Health

`/api/health` devuelve `version: "1.12.18"` e incorpora las features:

- `visitor-theme-switcher`
- `light-theme`
- `dark-theme`
- `theme-preference-persistence`

## Compatibilidad conservada

Se ha mantenido el comportamiento del chat móvil validado previamente. El bloque CSS heredado que contenía saltos de línea escapados literalmente se normalizó a CSS válido sin modificar su intención de layout.
