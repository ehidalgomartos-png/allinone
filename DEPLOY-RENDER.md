# Render — OmniSocial V0.8

La V0.8 utiliza el mismo servicio y la misma base PostgreSQL que V0.7.1.

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check: /api/health
```

Variables existentes:

```text
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL>
JWT_SECRET=<secreto existente>
```

No añadas variables nuevas. Después del deploy, `/api/health` debe indicar `0.8.0`.
