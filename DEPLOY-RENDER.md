# Deploy nuevo de OmniSocial V0.3 en Render

Si ya tienes V0.2 funcionando, usa `ACTUALIZAR-A-V0.3.md` y no crees otra base.

Para un despliegue desde cero:

1. Sube todos los archivos a la raíz de un repositorio GitHub.
2. En Render crea un Blueprint desde ese repositorio.
3. `render.yaml` crea el servicio web y PostgreSQL.
4. Completa en Render los valores marcados como `sync: false`: `META_APP_ID` y `META_APP_SECRET`; `META_LOGIN_CONFIG_ID` es opcional.
5. Configura en Meta como OAuth callback: `https://TU-SERVICIO.onrender.com/api/meta/oauth/callback`.
6. Comprueba `/api/health`.
7. Entra en `Mis redes` -> `Conectar Meta`.

El Blueprint genera automáticamente `JWT_SECRET` y `TOKEN_ENCRYPTION_KEY` y toma `PUBLIC_BASE_URL` del `RENDER_EXTERNAL_URL` asignado por Render.
