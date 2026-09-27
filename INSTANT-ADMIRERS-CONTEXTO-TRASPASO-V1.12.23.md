# Instant Admirers — Contexto de traspaso V1.12.23

## Base
V1.12.22 — Virtual Profiles SEO fue desplegada y `/api/health` confirmó `1.12.22`. El sitemap llegó a contener los 100 anfitriones virtuales más los perfiles públicos existentes.

## V1.12.23 — Virtual Profile Dynamic SEO Fix
Estado: preparada para desplegar; no considerar estable hasta validación del usuario en Render/Search Console.

### Motivo
Google Search Console confirmó que una URL virtual era indexable y detectó `ProfilePage`, pero al renderizar JavaScript veía el title y description genéricos de Instant Admirers. La causa era `public/i18n.js`, que sobrescribía el head dinámico generado por servidor durante la hidratación.

### Solución
- Las páginas de perfil público incluyen `meta[name="ia-dynamic-seo"][content="profile"]`.
- `i18n.js` detecta esa marca y conserva title, description, Open Graph y Twitter dinámicos.
- SEO virtual enriquecido con ciudad, edad e intereses.
- JSON-LD mantiene divulgación explícita de personaje virtual y añade ubicación/intereses.
- Canonical individual intacto.
- Portadas placeholder: texto más natural “Anfitrión virtual de la comunidad Instant Admirers”.
- Términos ES/EN actualizados para reflejar que perfiles virtuales públicos pueden aparecer en directorio, sitemap y buscadores, siempre identificados como virtuales.
- `/api/health` = `1.12.23` con features `virtual-profile-dynamic-meta` y `profile-seo-hydration-preservation`.
- Cache PWA = `instant-admirers-v1.12.23`.

### Validación esperada
1. Desplegar V1.12.23.
2. Confirmar `/api/health` = `1.12.23`.
3. En Search Console: Inspección de URL → Probar URL publicada sobre `/lucia.vidal.01`.
4. Verificar en HTML probado un title tipo `Lucía V. · Perfil virtual en Valencia | Instant Admirers` y description específica del perfil.
5. Si es correcto, solicitar indexación.

## Siguiente bloque previsto
V1.12.24 — Virtual Profile Image System: identidad visual consistente por personaje, con objetivo inicial de avatar + portada + 4 fotos por perfil, usando imágenes sintéticas y manteniendo la identificación de perfil virtual.
