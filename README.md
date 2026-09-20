# Instant Admirers V1.1.1 — Rebranding

Esta versión parte de OmniSocial V1.1 y cambia la identidad pública del proyecto a **Instant Admirers** sin tocar usuarios, publicaciones ni la base PostgreSQL.

## Incluye

- Marca **Instant Admirers**.
- Tagline: **Conecta. Comparte. Descubre.**
- Logo horizontal + isotipo.
- Favicon `.ico`.
- Apple Touch Icon.
- Iconos 192/512 para PWA.
- `manifest.webmanifest`.
- Metadatos SEO y Open Graph.
- Imagen social 1200×630.
- `robots.txt` y `sitemap.xml`.
- Guía para conectar `instantadmirers.com` con Render + DonDominio.
- Borradores legales separados y no publicados hasta completar los datos del titular.

## Importante

No renombres el Web Service ni la base de datos en Render. Pueden seguir llamándose internamente `omnisocial` y `omnisocial-db`. Así evitamos crear recursos nuevos o romper conexiones existentes.

## Actualizar

1. Sube el contenido de esta carpeta al mismo repositorio GitHub `allinone`.
2. Haz commit en `main`.
3. Espera al Auto-Deploy de Render.
4. Comprueba `/api/health` y confirma `"version":"1.1.1"`.
5. Sigue `DOMINIO-INSTANTADMIRERS.md` para conectar el dominio.

## Legal

Los documentos de `legal-drafts/` son borradores de trabajo. Antes de hacerlos públicos completa `LEGAL-COMPLETAR.md` y revisa los textos con tus datos reales y, si procede, asesoramiento profesional.
