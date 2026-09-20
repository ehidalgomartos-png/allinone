# Render — OmniSocial V0.7

La V0.7 usa el mismo Web Service y la misma PostgreSQL de las versiones anteriores.

No requiere variables de entorno nuevas.

Configuración esperada:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check: /api/health
```

Variables necesarias existentes:

```text
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL>
JWT_SECRET=<valor secreto>
```

Después del deploy, `/api/health` debe indicar `0.7.0`.
