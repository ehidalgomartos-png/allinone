# Deploy Instant Admirers V1.12.6 — Bunny Media

Usa el mismo servicio Render y la misma PostgreSQL existentes.

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`
- Dominio: `https://instantadmirers.com`

## Antes del deploy
Configura en Render las credenciales de Bunny descritas en `BUNNY-CONFIGURACION-V1.12.6.md`.

No guardes claves secretas en GitHub.

## Variables no secretas
```text
BUNNY_STORAGE_ZONE=instant-admirers-media
BUNNY_STORAGE_ENDPOINT=https://storage.bunnycdn.com/instant-admirers-media
BUNNY_CDN_HOST=instant-admirers-media.b-cdn.net
BUNNY_STREAM_LIBRARY_ID=761236
BUNNY_STREAM_CDN_HOST=vz-db3f5e78-953.b-cdn.net
ALLOW_CLOUDINARY_UPLOAD_FALLBACK=false
HARDEN_LEGACY_MEDIA_ON_START=false
```

## Variables secretas
```text
BUNNY_STORAGE_KEY
BUNNY_CDN_TOKEN_KEY
BUNNY_STREAM_API_KEY
BUNNY_STREAM_TOKEN_KEY
```

`BUNNY_STREAM_WEBHOOK_SECRET` es opcional.

## Después del deploy
Abre:

```text
https://instantadmirers.com/api/health
```

Debe indicar `version: 1.12.6`, `images: bunny_storage` y `videos: bunny_stream`.
