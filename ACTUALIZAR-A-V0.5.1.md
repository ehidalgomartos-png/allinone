# Actualizar OmniSocial V0.5 → V0.5.1

Esta actualización simplifica la pantalla de Inicio. No modifica la base de datos.

## Cambios visuales
- Se elimina el gran bloque de título/subtítulo de Inicio.
- Stories más compactas.
- El formulario completo de publicación ya no ocupa espacio en el feed.
- En su lugar aparece una barra compacta `¿Qué quieres compartir?`.
- Al tocarla se abre el editor completo en una ventana/modal.
- El estado de feed vacío ocupa menos altura.
- La marca OmniSocial queda visible en la barra superior móvil.

## Actualización
Sube al mismo repositorio de GitHub, sustituyendo los archivos anteriores:

- `public/app.js`
- `public/styles.css`
- `server.js`
- `package.json`

No borres PostgreSQL, no crees otro servicio Render y no cambies `DATABASE_URL`.

Render desplegará automáticamente tras el commit.

Comprueba:

`https://omnisocial-rwn6.onrender.com/api/health`

Debe indicar `version: "0.5.1"`.
