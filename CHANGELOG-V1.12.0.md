# Changelog V1.12.0 — Protección de contenido

- Nueva entrega multimedia protegida mediante URLs firmadas, temporales y ligadas a la sesión del espectador.
- El servidor vuelve a validar permisos antes de entregar una foto o vídeo.
- Los recursos Cloudinary protegidos se sirven mediante proxy y no mediante redirección a la URL de origen.
- Nuevas subidas de usuario a Cloudinary pasan a tipo `authenticated`.
- Migración automática no bloqueante para reforzar multimedia Cloudinary heredada de versiones anteriores.
- Comando de recuperación/reintento `npm run harden:media`.
- `/media/:id` queda limitado a avatar y portada; multimedia social usa `/protected-media/:id`.
- Protección aplicada a publicaciones, republicaciones, Stories, Reels, Guardados, mensajes y publicaciones compartidas por mensaje.
- Compatibilidad preservada para multimedia sintética del Demo Lab.
- Marca de agua configurable por perfil: `exclusive`, `all` u `off`.
- La marca de agua identifica al espectador con `@usuario · instantadmirers.com` cuando está activada.
- Vídeos protegidos usan `controlsList="nodownload noremoteplayback"` y desactivan Picture-in-Picture cuando el navegador lo soporta.
- Imágenes/vídeos protegidos bloquean menú contextual y arrastre como disuasión adicional.
- Logout limpia también la sesión multimedia HttpOnly.
- `sw.js` excluye `/protected-media/` de la caché PWA.
- Añadidas `MEDIA_URL_TTL_SECONDS` y `HARDEN_LEGACY_MEDIA_ON_START` a `.env.example`.
- `/api/health`, PWA y assets actualizados a 1.12.0.
