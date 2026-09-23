# Actualizar a V1.11.0

1. Sustituye el proyecto por el contenido completo de este ZIP.
2. Despliega en Render con la misma base PostgreSQL y las mismas variables de entorno.
3. No ejecutes SQL manualmente: `src/schema.sql` añade las nuevas columnas de forma automática al arrancar.
4. Comprueba `https://instantadmirers.com/api/health`: debe indicar `version: 1.11.0`.
5. Haz una recarga completa de la web/PWA para recibir la caché `instant-admirers-v1.11.0`.
6. Prueba una ventana privada con navegador en español: debe abrir en ES.
7. Prueba una ventana privada con navegador en inglés: debe abrir en EN.
8. Cambia manualmente ES / EN y recarga: la selección debe conservarse.
9. Inicia sesión, cambia el idioma en Ajustes y comprueba que se guarda en la cuenta.
10. En Administración → Publicidad, edita un anuncio y completa, si quieres, sus campos de texto en español e inglés.

## Comprobaciones recomendadas
- Inicio, Descubrir, Personas, Perfil, Seguidores/Siguiendo y Mensajes en ambos idiomas.
- Registro, verificación de email y recuperación de contraseña.
- `/terms/` y `/en/terms/` (y el resto de páginas legales).
- Publicidad en columna derecha, feed y perfiles en ES y EN.
- PWA/offline en ambos idiomas.

No se modifica ni traduce automáticamente el contenido publicado por los usuarios.
