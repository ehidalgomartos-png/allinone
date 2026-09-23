# Instant Admirers V1.12.1 — Bloqueo de descarga reforzado

Corrección sobre V1.12.0.

## Cambios
- El contenedor de cada foto/vídeo protegido bloquea explícitamente el menú contextual y el arrastre.
- Las imágenes protegidas dejan de recibir eventos del puntero directamente, de forma que el navegador no ofrece el menú contextual específico de una imagen.
- Se bloquean `contextmenu`, clic secundario, `auxclick`, arrastre y selección sobre multimedia protegida en fase de captura.
- Se añade `-webkit-touch-callout:none` para reducir el menú de pulsación larga en navegadores WebKit/iOS.
- Caché PWA y assets subidos a 1.12.1 para forzar la actualización del frontend.
- `/api/health` añade `enhanced-contextmenu-deterrence`.

## Límite
Esto dificulta la descarga casual. No puede impedir capturas de pantalla, grabación de pantalla ni extracción por herramientas avanzadas de desarrollo una vez que un usuario está autorizado a ver el contenido.
