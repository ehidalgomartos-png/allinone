# OmniSocial V0.3

OmniSocial V0.3 mantiene el núcleo de la V0.2 y añade conexión OAuth real con Meta para Facebook Pages e Instagram profesional.

## Qué funciona

- Registro/login y perfiles.
- Feed, descubrir personas, seguir, likes y comentarios.
- PostgreSQL persistente en Render.
- Fotos y vídeos almacenados en PostgreSQL para este MVP.
- Conexión real de Meta mediante OAuth.
- Selección de Página de Facebook si el usuario administra varias.
- Detección de Instagram Business/Creator vinculado a la Página.
- Publicación desde OmniSocial hacia Facebook Pages.
- Publicación de imagen y Reel hacia Instagram profesional.
- Cola de distribución con estados Pendiente / Publicando / Publicado / Error.
- Reintento manual de publicaciones fallidas.
- Tokens cifrados con AES-256-GCM mediante TOKEN_ENCRYPTION_KEY.

## Limitaciones actuales

- Facebook publica en Páginas, no en perfiles personales.
- El flujo de Instagram usado en V0.3 requiere una cuenta profesional (Business o Creator) vinculada a la Página de Facebook seleccionada.
- TikTok, YouTube y X siguen reservados para siguientes versiones.
- El límite de subida del MVP es 10 MB.
- Para usar Meta con personas ajenas a los roles/testers de la app hay que completar la revisión de Meta y obtener los permisos necesarios.

## Variables necesarias

```env
DATABASE_URL=...
JWT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
META_APP_ID=...
META_APP_SECRET=...
META_LOGIN_CONFIG_ID=...   # opcional, si Facebook Login for Business usa configuración
META_GRAPH_VERSION=v26.0
PUBLIC_BASE_URL=https://tu-servicio.onrender.com
```

Render proporciona `RENDER_EXTERNAL_URL`; el Blueprint lo expone como `PUBLIC_BASE_URL`.

## Desarrollo local

```bash
npm install
copy .env.example .env
npm start
```

Abre http://localhost:3000

## Actualización desde V0.2

No borres PostgreSQL. `src/schema.sql` utiliza `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, por lo que la base V0.2 se actualiza al iniciar V0.3.

Lee `ACTUALIZAR-A-V0.3.md` para el despliegue sobre tu servicio existente.
