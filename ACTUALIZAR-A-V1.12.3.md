# Actualizar a V1.12.3

1. Sustituye los archivos de la versión anterior por los de este ZIP.
2. No borres PostgreSQL ni Cloudinary.
3. La columna `friend_gate_message` se crea automáticamente al iniciar.
4. Despliega en Render.
5. Comprueba `/api/health`: debe mostrar `1.12.3` y las funciones `profile-access-message` y `compact-direct-profile-auth`.
6. Haz una recarga completa del navegador o vuelve a abrir la PWA para cargar la nueva caché.

## Prueba recomendada
- En un perfil con acceso especial abre **Condición**.
- Escribe un mensaje de acceso y guárdalo.
- Abre el perfil desde otra cuenta: el mensaje debe aparecer encima del progreso.
- Abre su enlace de invitación sin sesión: el mismo mensaje debe verse tanto en **Entrar** como en **Crear cuenta**.
