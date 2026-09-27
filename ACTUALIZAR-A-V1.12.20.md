# Actualizar a Instant Admirers V1.12.20

1. Desplegar esta carpeta/ZIP sobre la V1.12.19.
2. No requiere nuevas variables de entorno.
3. No requiere migración manual de PostgreSQL.
4. Comprobar `/api/health`: debe devolver `version: "1.12.20"`.
5. La PWA usa la caché `instant-admirers-v1.12.20`; si el navegador conserva estilos anteriores, hacer una recarga completa una vez.
6. Probar en modo claro un mensaje propio y comprobar que aparece sobre una burbuja fucsia/violeta con texto blanco.
7. En un mensaje propio, pulsar el botón de borrar, confirmar y comprobar que desaparece para ambos participantes.
