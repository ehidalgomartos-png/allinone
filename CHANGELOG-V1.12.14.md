# V1.12.14 — Chat Responsive Fix

- Corrige el chat de escritorio para que la lista de mensajes tenga un área de scroll real y no quede recortada por el contenedor.
- El panel de mensajes usa `minmax(0, 1fr)`, `min-height: 0` y overflow interno controlado.
- Refuerza el auto-scroll al último mensaje al abrir una conversación y cuando se actualiza una conversación que ya estaba abajo.
- Tras refrescar mensajes se vuelven a inicializar los medios lazy dentro del chat.
- En móvil el compositor se reorganiza en dos filas: texto arriba; galería/cámara/vídeo + Enviar abajo.
- Añade soporte de `safe-area-inset-bottom` para móviles/PWA.
- Sin cambios de base de datos, Bunny, Growth Engine ni permisos del chat.
