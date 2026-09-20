# OmniSocial V0.6 — Amigos y chat en tiempo real

Esta versión continúa desde V0.5.1 y mantiene intactos usuarios, publicaciones, Stories, Reels, likes, comentarios, guardados y conversaciones.

## Novedades V0.6

- Solicitudes de amistad: enviar, cancelar, aceptar, rechazar y eliminar amistad.
- Página de Amigos accesible desde el perfil y Actividad.
- Estado `En línea` y última conexión.
- Mensajería en tiempo real con Socket.IO.
- Indicador `Escribiendo…`.
- Responder a un mensaje concreto.
- Compartir publicaciones por mensaje privado.
- Contador de mensajes y actividad actualizado en tiempo real.
- Avisos del navegador mientras OmniSocial está abierto (con permiso del usuario).
- La privacidad de los posts se respeta también al compartirlos por privado.

## Sigue incluyendo

- Registro / login con JWT.
- PostgreSQL en Render.
- Feed, Descubrir, búsqueda, perfiles y seguidores.
- Fotos y vídeos.
- Stories de 24 h.
- Reels.
- Likes, comentarios, guardados y notificaciones.
- Interfaz responsive móvil / tablet / ordenador.

## Despliegue

Si ya tienes V0.5.1 funcionando en Render, NO borres la base de datos ni crees otro servicio.

1. Descomprime el ZIP.
2. Sube el contenido a la raíz del mismo repositorio de GitHub.
3. Haz commit.
4. Render desplegará automáticamente.
5. Comprueba `/api/health`.

Respuesta esperada:

```json
{
  "ok": true,
  "version": "0.6.0",
  "database": "postgresql",
  "mode": "own-community"
}
```

Las migraciones se ejecutan automáticamente desde `src/schema.sql` al arrancar.

## Nota sobre presencia en tiempo real

La presencia `En línea` se mantiene en memoria en la instancia web. Es adecuada para este MVP y una única instancia de Render. Cuando OmniSocial escale a varias instancias, convendrá mover presencia y eventos a Redis.

## Multimedia

Esta versión conserva el almacenamiento de multimedia en PostgreSQL para simplificar el MVP. Antes de crecer en usuarios y vídeo, es recomendable migrar los archivos a un almacenamiento de objetos (S3, Cloudinary o equivalente).
