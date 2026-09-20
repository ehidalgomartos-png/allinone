# OmniSocial V0.7.1 — Borrar foto de perfil y portada

Actualización pequeña sobre V0.7. No borra usuarios, publicaciones, mensajes, Stories, amistades ni ninguna otra información.

## Qué cambia

En **Perfil → Editar perfil**:

- Si tienes foto de perfil aparece **Eliminar foto**.
- Si tienes portada aparece **Eliminar portada**.
- Al eliminar la foto de perfil vuelven a mostrarse tus iniciales.
- Al eliminar la portada vuelve el fondo predeterminado de OmniSocial.
- Se pide confirmación antes de borrar.
- Si el archivo pertenece a OmniSocial y no está siendo usado por posts, Stories o mensajes, también se elimina de la tabla `media`.

## Cómo actualizar

1. No borres Render ni PostgreSQL.
2. Descomprime `OmniSocial-V0.7.1-Perfil-Fotos.zip`.
3. Sube su contenido al mismo repositorio GitHub, sustituyendo los archivos actuales.
4. Haz commit.
5. Render realizará el despliegue automáticamente.

Los archivos que cambian son principalmente:

- `server.js`
- `public/app.js`
- `public/styles.css`
- `package.json`

No hay cambios de esquema de base de datos.

## Comprobación

Visita:

`https://omnisocial-rwn6.onrender.com/api/health`

Debe mostrar `"version":"0.7.1"`.

Después entra en **Perfil → Editar perfil** y prueba los dos botones de eliminación.
