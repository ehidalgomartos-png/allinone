# Despliegue en Render — OmniSocial V0.4

Si ya tienes OmniSocial V0.3 funcionando en Render, **no crees otro servicio ni otra base de datos**. Sube esta versión al mismo repositorio de GitHub y deja que Render despliegue el nuevo commit.

## Comprobación

Después del despliegue abre:

`https://TU-APP.onrender.com/api/health`

Debe aparecer:

```json
{
  "ok": true,
  "version": "0.4.0",
  "database": "postgresql",
  "mode": "own-community"
}
```

La migración de base de datos se ejecuta al arrancar y conserva cuentas y publicaciones existentes.
