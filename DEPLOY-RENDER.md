# Render — OmniSocial V1.0

Mantén el mismo Web Service y la misma PostgreSQL que ya utilizas.

Render debe usar:

```text
Build Command: npm install
Start Command: npm start
Health Check: /api/health
```

Variables necesarias:

```text
DATABASE_URL     (ya enlazada a PostgreSQL)
JWT_SECRET       (ya configurada)
NODE_ENV=production
```

Para usar el panel de moderación añade manualmente:

```text
ADMIN_EMAILS=tu@email.com
```

No es necesario modificar `DATABASE_URL` ni recrear la base.
