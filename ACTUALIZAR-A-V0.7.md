# Actualizar OmniSocial V0.6 → V0.7

No borres el servicio `omnisocial` de Render y no borres `omnisocial-db`.

## 1. Haz una copia del estado estable

Antes de subir V0.7, conserva el ZIP V0.6 o crea un tag/release en GitHub. Así puedes volver al código anterior si fuera necesario. La base de datos es compatible hacia delante.

## 2. Sube V0.7 al mismo repositorio

Descomprime `OmniSocial-V0.7-Comunidad.zip` y sustituye los archivos del repositorio actual.

Los principales son:

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

Haz commit en la misma rama `main`.

## 3. Espera el deploy de Render

Render ejecutará:

```text
npm install
npm start
```

Al arrancar, `src/schema.sql` añadirá automáticamente las migraciones de V0.7.

## 4. Comprueba la salud

Abre:

```text
https://omnisocial-rwn6.onrender.com/api/health
```

Debe incluir:

```json
"version": "0.7.0"
```

## 5. Prueba recomendada

Con dos cuentas distintas:

1. Publica `Hola @segundousuario #prueba`.
2. Comprueba que `@segundousuario` abre su perfil.
3. Comprueba que el segundo usuario recibe la notificación de mención.
4. Pulsa Compartir → Republicar en OmniSocial.
5. Edita el texto de tu post y confirma que aparece `editado`.
6. Ve a Descubrir y comprueba la tira de tendencias.
7. Edita tu perfil, añade portada, frase e intereses.
8. Comprueba la misma interfaz desde móvil y ordenador.

## Privacidad de reposts

Solo se pueden republicar publicaciones públicas. Si el autor original cambia después la privacidad y el repost deja de ser visible para un usuario, OmniSocial no muestra el contenido original dentro del repost.
