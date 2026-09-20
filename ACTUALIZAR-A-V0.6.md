# Actualizar OmniSocial V0.5.1 → V0.6

No borres `omnisocial-db`, no crees otro Blueprint y no cambies `DATABASE_URL` ni `JWT_SECRET`.

## 1. GitHub

Descomprime `OmniSocial-V0.6-Amigos-Realtime.zip` y sube/reemplaza en el mismo repositorio:

```text
server.js
package.json
render.yaml
src/db.js
src/schema.sql
public/index.html
public/app.js
public/styles.css
```

Haz **Commit changes**.

## 2. Render

El Auto-Deploy debería comenzar solo. Si no lo hace:

**Render → omnisocial → Manual Deploy → Deploy latest commit**

Durante el build aparecerá una nueva dependencia: `socket.io`.

## 3. Base de datos

Al arrancar, OmniSocial añade automáticamente:

```text
users.last_seen_at
friend_requests
friendships
messages.reply_to_id
messages.shared_post_id
```

No se borran tablas ni datos anteriores.

## 4. Comprobación

Abre:

```text
https://omnisocial-rwn6.onrender.com/api/health
```

Debe mostrar `"version":"0.6.0"`.

## 5. Pruebas recomendadas

Para probar el tiempo real, abre dos cuentas distintas (por ejemplo una en Chrome y otra en incógnito/móvil):

1. Enviar una solicitud de amistad.
2. Aceptarla desde la otra cuenta.
3. Comprobar `En línea`.
4. Abrir una conversación entre ambas.
5. Escribir sin enviar y comprobar `Escribiendo…`.
6. Enviar un mensaje y comprobar que aparece sin recargar.
7. Responder a un mensaje.
8. Compartir una publicación mediante el icono `↗`.
9. Activar avisos del navegador desde Actividad si quieres probarlos.
