# OmniSocial V1.0.1

Primera versión completa de la comunidad propia OmniSocial.

## Incluye

- Registro, login y perfiles completos.
- Feed Siguiendo y feed Para ti.
- Fotos, vídeos, Stories, Reels y publicaciones de texto.
- Likes, comentarios, guardados, reposts, menciones y hashtags.
- Amigos, seguidores, cuentas privadas y solicitudes de seguimiento.
- Mensajes privados en tiempo real con respuestas y contenido compartido.
- Bloqueos, silencios, denuncias y control de quién puede escribirte.
- Onboarding inicial para nuevos usuarios.
- Ajustes de cuenta, cambio de contraseña y eliminación de cuenta.
- Panel de administración para revisar denuncias, retirar posts y suspender/reactivar cuentas.
- PostgreSQL y despliegue en Render.

## Administrador

Para activar el panel de administración, añade en Render una variable de entorno:

```text
ADMIN_EMAILS=tu@email.com
```

Puedes indicar varios emails separados por comas. El email debe coincidir con el utilizado por la cuenta de OmniSocial.

Después reinicia/redeploy el servicio y vuelve a iniciar sesión. Aparecerá **Administración** en el menú y en tu perfil.

## Health check

```text
/api/health
```

Debe devolver `version: "1.0.1"`.

## Desarrollo local

1. Instala PostgreSQL.
2. Copia `.env.example` a `.env`.
3. Ajusta `DATABASE_URL`, `JWT_SECRET` y opcionalmente `ADMIN_EMAILS`.
4. Ejecuta:

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Nota sobre multimedia

En esta versión MVP las imágenes y vídeos siguen guardándose en PostgreSQL. Antes de crecer a un volumen importante conviene mover multimedia a almacenamiento de objetos (S3/Cloudinary/R2 o similar).


## V1.0.1 — progreso de Stories
- La barra superior de cada Story avanza visualmente.
- Las fotos duran 6 segundos y pasan automáticamente a la siguiente.
- En vídeo, la barra se sincroniza con la duración/reproducción real.
- Las Stories anteriores quedan marcadas como completadas.
