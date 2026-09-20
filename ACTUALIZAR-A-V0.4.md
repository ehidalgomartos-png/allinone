# Actualizar OmniSocial V0.3 → V0.4

1. **No borres `omnisocial-db` en Render.**
2. Descomprime `OmniSocial-V0.4-Comunidad.zip`.
3. En tu repositorio GitHub actual sustituye los archivos por los de la nueva versión.
4. Asegúrate de subir también `src/schema.sql`, `public/app.js` y `public/styles.css`.
5. Haz commit en `main`.
6. Render desplegará automáticamente. Si no lo hace: **Manual Deploy → Deploy latest commit**.
7. Abre `https://TU-APP.onrender.com/api/health`.

Resultado esperado:

```json
{
  "ok": true,
  "version": "0.4.0",
  "database": "postgresql",
  "mode": "own-community"
}
```

Tus cuentas y publicaciones existentes se conservan.
