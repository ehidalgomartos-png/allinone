# Actualizar V1.12.16 → V1.12.17

1. Sustituye el contenido del repositorio por esta versión.
2. No borres PostgreSQL ni cambies Bunny, Resend o variables de Render.
3. Haz commit en `main` y espera el despliegue.
4. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.12.17"`.
5. Comprueba `https://instantadmirers.com/sitemap.xml`: debe incluir `sitemap-profiles.xml`.
6. Comprueba `https://instantadmirers.com/sitemap-profiles.xml`: debe listar sólo perfiles con vista pública activada.
7. Abre un perfil como `https://instantadmirers.com/rubi`, revisa el código fuente y confirma title/description/canonical/JSON-LD.
8. En Google Search Console no hace falta enviar un sitemap nuevo si ya enviaste `sitemap.xml`: el índice apunta automáticamente al sitemap de perfiles. Si quieres supervisarlo por separado, puedes añadir `sitemap-profiles.xml`.

No hay campos SEO manuales para el propietario.
