# Instant Admirers V1.12.9 — Video Quality Startup

## Objetivo
Reducir el arranque excesivamente borroso de los vídeos Bunny Stream sin convertir la reproducción en calidad fija. HLS sigue siendo adaptativo.

## Qué cambia
- HLS.js deja de partir del estimador conservador de 500 kbps.
- Se calcula una estimación inicial prudente según `navigator.connection` cuando el navegador la ofrece.
- Si el usuario tiene ahorro de datos activado o una conexión 2G/3G, se conserva un arranque ligero.
- En conexiones 4G/Wi-Fi/rápidas se permite una calidad inicial notablemente mayor.
- `capLevelToPlayerSize` evita descargar una resolución innecesariamente superior al tamaño del reproductor.
- Tras el arranque, ABR continúa subiendo o bajando de calidad automáticamente según la conexión real.
- Safari/iPhone/iPad mantienen HLS nativo; el sistema operativo decide la adaptación de calidad.

## Compatibilidad
No requiere migraciones de PostgreSQL ni variables nuevas de Render/Bunny. Mantiene V1.12.8 Growth Engine Profile Preview, SEO, seguridad, Bunny Storage y Bunny Stream.

## Verificación
1. Desplegar en Render.
2. Confirmar `/api/health` con `version: 1.12.9`.
3. Abrir un Reel/vídeo nuevo en Chrome/Edge y comprobar que el primer tramo arranca más nítido.
4. Probar también en móvil y con ahorro de datos para verificar que HLS sigue adaptándose.
