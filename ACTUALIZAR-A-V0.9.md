# Actualizar OmniSocial V0.8 → V0.9

## 1. No borres nada en Render

Conserva:

- el Web Service actual;
- `omnisocial-db`;
- `DATABASE_URL`;
- `JWT_SECRET`.

## 2. Actualiza el mismo repositorio de GitHub

Descomprime `OmniSocial-V0.9-Privacidad.zip` y sustituye los archivos del repositorio actual por los nuevos.

Los archivos principales que cambian son:

- `server.js`
- `package.json`
- `src/schema.sql`
- `public/app.js`
- `public/styles.css`

Haz commit en la misma rama que utiliza Render.

## 3. Espera el Auto Deploy

Durante el arranque se crean automáticamente las nuevas columnas y tablas de privacidad. Los datos anteriores se conservan.

## 4. Comprueba la versión

Abre:

`https://TU-SERVICIO.onrender.com/api/health`

Debe devolver `"version":"0.9.0"`.

## 5. Prueba recomendada con dos cuentas

- Pon la cuenta A como privada desde Perfil → Privacidad.
- Desde B pulsa “Solicitar seguir”.
- A acepta la solicitud y B debe poder ver sus posts.
- A silencia B: sus posts/Stories deben desaparecer de los feeds automáticos de A.
- A bloquea B: se eliminan seguimiento/amistad y B deja de poder abrir el perfil o enviar mensajes nuevos.
- Cambia “Quién puede enviarte mensajes” y compruébalo desde la otra cuenta.
- Denuncia un post de prueba y verifica que la app confirma el envío.

## Si algo falla

Pásame el primer bloque de error del log de Render desde la primera línea que empiece por `Error:` o `error:`.
