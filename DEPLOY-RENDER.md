# Deploy Instant Admirers V1.12.9 — Video Quality Startup

Usa el mismo servicio Render y la misma PostgreSQL existentes.

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`
- Dominio: `https://instantadmirers.com`

## Configuración
V1.12.9 no añade variables de entorno ni migraciones.

Conserva exactamente la configuración Bunny de V1.12.6:
- Bunny Storage para imágenes;
- Bunny Stream para vídeos;
- Cloudinary solo como compatibilidad legacy.

## Después del deploy
Abre:

```text
https://instantadmirers.com/api/health
```

Debe indicar `version: 1.12.9`, `images: bunny_storage` y `videos: bunny_stream`.

Después prueba un enlace real de Growth Engine en incógnito. La vista previa visual del perfil debe mostrarse tanto en Entrar como en Crear cuenta.
