# Actualizar Instant Admirers V1.2.3 → V1.2.4

1. **No borres** Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.2.4-Doble-Invitacion.zip`.
3. Sube el contenido al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main` y espera al Auto Deploy de Render.
5. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.2.4"`.

## Qué cambia

### 1. Invitación normal
El enlace personal lleva a la página principal. El invitado crea su cuenta y su perfil de forma normal.

### 2. Invitación directa a un perfil
Si el propietario tiene activado **Acceso a mi perfil**, puede compartir un segundo enlace. El invitado:

- crea/inicia su cuenta;
- entra automáticamente al perfil que le han compartido;
- ve `Te quedan X para poder ver este perfil`;
- puede seguir usando Instant Admirers normalmente mientras completa el reto.

Los amigos que invite desde el reto reciben un enlace para crear **su propia cuenta normal**. Si la condición exige una publicación, cuentan cuando publican su primer post.

## Privacidad del perfil bloqueado
Hasta completar el reto no se muestran biografía, portada, estadísticas, publicaciones, Stories ni Reels de ese perfil. Al alcanzar el objetivo se desbloquea automáticamente.

## Base de datos
Esta versión reutiliza las tablas y campos creados en V1.2.3. No necesita borrar ni recrear datos.
