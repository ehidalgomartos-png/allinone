# Changelog — Instant Admirers V1.12.19

## Light Theme Contrast Fix

Partiendo de V1.12.18, se corrigen varios problemas de contraste detectados al probar el modo claro:

- Tendencias: los hashtags ya no quedan blancos/invisibles; mantienen contraste normal y al pasar el ratón.
- Tendencias: singular/plural corregido (`1 post`, `1 persona`, `1 interacción`).
- Selector de feed: “Siguiendo” y “Para ti” conservan texto oscuro/legible también en hover.
- Estadísticas de perfil: publicaciones, seguidores, siguiendo y amigos mantienen contraste correcto al pasar el ratón sobre los enlaces.
- Chat: los mensajes recibidos usan texto oscuro explícito y una burbuja gris clara con mayor contraste.
- Se mantiene sin cambios el modo oscuro.
- Sin migración de base de datos.

### Versión técnica
- package: `1.12.19`
- `/api/health`: `1.12.19`
- Service Worker: `instant-admirers-v1.12.19`
- Feature: `light-theme-contrast-fix`
