# Actualizar OmniSocial V0.4.1 → V0.5

## Importante

No borres:

- el Web Service `omnisocial` de Render;
- la base PostgreSQL `omnisocial-db`;
- las variables `DATABASE_URL` y `JWT_SECRET`.

La migración es automática al arrancar.

## 1. Sube la V0.5 al mismo repositorio GitHub

Sustituye los archivos anteriores por los de este ZIP. En la raíz deben quedar al menos:

```text
server.js
package.json
render.yaml
README.md
ACTUALIZAR-A-V0.5.md

src/
  db.js
  schema.sql

public/
  index.html
  app.js
  styles.css
```

Asegúrate especialmente de subir la carpeta `src` completa y la carpeta `public` completa.

## 2. Commit

Haz el commit en la rama `main`.

Render debería iniciar un Auto-Deploy. Si no lo hace:

`Render → omnisocial → Manual Deploy → Deploy latest commit`

## 3. Comprueba salud

Abre:

```text
https://omnisocial-rwn6.onrender.com/api/health
```

Debe devolver algo parecido a:

```json
{
  "ok": true,
  "version": "0.5.0",
  "database": "postgresql",
  "mode": "own-community",
  "features": ["stories", "reels", "messages"]
}
```

## 4. Pruebas recomendadas

1. Entra con tu usuario anterior.
2. Comprueba que siguen estando tus publicaciones.
3. Crea una Story con foto.
4. Crea una publicación con vídeo y abre Reels.
5. Crea un segundo usuario de prueba.
6. Desde un perfil pulsa `Mensaje`.
7. Envía texto y una foto.
8. Vuelve al segundo usuario y comprueba el contador de mensajes no leídos.

## Nuevas tablas

V0.5 crea automáticamente:

- `stories`
- `story_views`
- `conversations`
- `conversation_reads`
- `messages`

No elimina ni recrea las tablas existentes.
