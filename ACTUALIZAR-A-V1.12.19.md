# Actualizar a Instant Admirers V1.12.19

1. Desplegar esta versión sobre la V1.12.18.
2. No hace falta migración de base de datos.
3. Esperar al nuevo despliegue de Render.
4. Comprobar `/api/health`: debe devolver `version: "1.12.19"`.
5. La PWA usa la caché `instant-admirers-v1.12.19`; si un navegador conserva la anterior, hacer una recarga completa una vez.
6. Probar en modo claro Tendencias, Siguiendo/Para ti, estadísticas del perfil y chat.
