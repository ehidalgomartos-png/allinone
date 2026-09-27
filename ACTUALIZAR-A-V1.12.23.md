# Actualizar a V1.12.23 — Virtual Profile Dynamic SEO Fix

1. Sube todos los archivos de V1.12.23 al repositorio y espera al despliegue de Render.
2. Comprueba `/api/health`: debe devolver `version: 1.12.23`.
3. Abre un perfil virtual en incógnito y confirma que sigue mostrando `✦ Perfil virtual`.
4. En Google Search Console usa **Inspección de URL → Probar URL publicada** sobre, por ejemplo, `/lucia.vidal.01`.
5. En el HTML probado confirma que `<title>`, `description`, `og:title`, `og:description`, Twitter y canonical contienen datos del perfil y no los textos genéricos de la portada.
6. Si la prueba es correcta, ya se puede pulsar **Solicitar indexación** y mantener enviado `sitemap-profiles.xml`.

No vuelvas a crear los 100 anfitriones: esta versión utiliza los ya existentes.
