# Render — Instant Admirers V1.1.2

Usa el mismo servicio de Render y la misma base PostgreSQL. No crees recursos nuevos.

- Build Command: `npm install`
- Start Command: `npm start`
- Mantén `DATABASE_URL`, `JWT_SECRET` y `ADMIN_EMAILS`.
- V1.1.2 no necesita variables de entorno nuevas.

Después del Auto-Deploy comprueba:

- `https://instantadmirers.com`
- `https://instantadmirers.com/api/health`
- `https://instantadmirers.com/legal/`
- `https://instantadmirers.com/privacy/`
- `https://instantadmirers.com/cookies/`
- `https://instantadmirers.com/terms/`
- `https://instantadmirers.com/community-guidelines/`

La respuesta de health debe incluir `"version":"1.1.2"`.
