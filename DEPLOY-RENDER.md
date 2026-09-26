# Deploy Instant Admirers V1.12.16 — Direct Public Profile

No requiere nuevas variables de entorno. Mantén PostgreSQL, Bunny Storage/Stream, Resend y el resto de configuración actual.

La migración de esquema es automática e idempotente al arrancar.

Tras desplegar:

- `/api/health` debe indicar `version: 1.12.16`.
- Activa la vista directa desde **Perfil → Privacidad → Vista previa pública de mi perfil**.
- Prueba `/usuario` en una ventana de incógnito.
- Haz Ctrl+F5 o reinicia la PWA si el navegador conserva recursos de V1.12.15.
