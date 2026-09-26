# Actualizar a Instant Admirers V1.12.18

1. Sustituir el proyecto actual por el contenido de este ZIP manteniendo las variables de entorno de Render.
2. No es necesaria ninguna migración de base de datos para esta versión.
3. Desplegar normalmente en Render.
4. Comprobar `/api/health`: debe devolver `version: "1.12.18"`.
5. Hacer una recarga completa si el navegador mantiene assets antiguos; la PWA migrará a la caché `instant-admirers-v1.12.18`.
6. Probar el selector Claro/Oscuro sin sesión y con sesión iniciada.
7. Confirmar que la elección persiste tras recargar y volver a abrir la web.

## Pruebas recomendadas

- Portada / Entrar / Crear cuenta.
- Feed y perfiles.
- Chat en escritorio y móvil.
- Perfil público directo `/usuario`.
- `/perfiles/`.
- Una landing de `/ciudades/` y otra de `/guias/`.
- Privacidad/Términos.
- PWA instalada si se utiliza.
