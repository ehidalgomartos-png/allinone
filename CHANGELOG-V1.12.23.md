# Instant Admirers — V1.12.23 — Virtual Profile Dynamic SEO Fix

## Problema corregido
Google Search Console podía rastrear e indexar los perfiles públicos, pero al ejecutar JavaScript `public/i18n.js` sustituía el `<title>`, la meta description y las etiquetas Open Graph/Twitter renderizadas por servidor por los metadatos genéricos de la portada.

## Cambios
- Las páginas SEO de perfil incluyen `meta[name="ia-dynamic-seo"]` para señalar que el head ya fue generado por servidor.
- `i18n.js` conserva el SEO dinámico de perfiles y deja de sobrescribirlo durante la hidratación.
- Los perfiles virtuales usan title dinámico con nombre y ciudad.
- La meta description virtual incorpora nombre, usuario, ciudad, edad e intereses cuando están disponibles.
- La ruta pública carga `users.interests` y `virtual_profiles.age` para enriquecer el SEO.
- JSON-LD `ProfilePage` + `Person` mantiene la divulgación de personaje virtual y añade ubicación e intereses cuando existen.
- Open Graph y Twitter Cards conservan los mismos metadatos dinámicos después de ejecutar JavaScript.
- Canonical individual permanece sin cambios.
- Se sustituye en las portadas placeholder la frase “Perfil sintético identificado · comunidad y conversación” por “Anfitrión virtual de la comunidad Instant Admirers”.
- Los Términos ES/EN se alinean con V1.12.22+: los perfiles virtuales siguen excluidos de métricas de usuarios reales, pero pueden ser públicos/indexables cuando están activos y siempre identificados como virtuales.
- Service Worker y referencias de assets actualizados a V1.12.23.

## Sin cambios
- Los perfiles virtuales siguen claramente identificados como ficticios/gestionados por Instant Admirers.
- No cuentan como usuarios reales en métricas internas.
- Los retirados/ocultos siguen fuera del sitemap y del SEO.
- No es necesario recrear los 100 perfiles.
- No requiere nuevas variables de entorno ni migración manual.
