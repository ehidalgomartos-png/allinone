# Instant Admirers V1.3 — Multimedia

Arquitectura objetivo:

- Render / Node.js: lógica de la aplicación.
- PostgreSQL: usuarios, relaciones, posts, mensajes y metadatos.
- Cloudinary: imágenes y vídeos.
- Resend: email transaccional.

La aplicación mantiene `/media/:id` como URL estable, por lo que posts, Stories, mensajes, avatar y portada siguen funcionando durante la migración sin cambiar los enlaces internos existentes.
