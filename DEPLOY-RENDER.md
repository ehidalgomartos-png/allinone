# Deploy Instant Admirers V1.12.10 — Public Teaser Profile

## Render
No requiere nuevas variables de entorno. Mantén las variables actuales de V1.12.9 (Bunny, Resend, PostgreSQL, etc.).

Despliega el repositorio de forma habitual. La migración de esquema es automática e idempotente.

## Comprobación
Abre `/api/health` y confirma `version: 1.12.10`, `images: bunny_storage` y `videos: bunny_stream`.

Después activa **Vista pública del perfil** en una campaña de Growth Engine y prueba el enlace en incógnito.

Esta versión no necesita ni utiliza `DEEPL_API_KEY`.
