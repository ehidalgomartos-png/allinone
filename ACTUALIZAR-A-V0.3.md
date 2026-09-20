# Actualizar OmniSocial V0.2 a V0.3

## 1. No borres nada en Render

Mantén:

- el Web Service `omnisocial`
- la base PostgreSQL `omnisocial-db`

La V0.3 reutiliza la misma base y la amplía automáticamente.

## 2. Sustituye los archivos del repositorio por los de este ZIP

Sube el contenido de V0.3 a la raíz del mismo repositorio GitHub.

Archivos nuevos importantes:

- `src/meta.js`
- `src/crypto.js`
- `ACTUALIZAR-A-V0.3.md`

Archivos modificados importantes:

- `server.js`
- `src/schema.sql`
- `public/app.js`
- `public/styles.css`
- `render.yaml`
- `package.json`

## 3. Deja que Render haga el nuevo deploy

Si no arranca automáticamente:

Render -> omnisocial -> Manual Deploy -> Deploy latest commit

Antes de configurar Meta, `/api/health` debe responder con algo parecido a:

```json
{"ok":true,"version":"0.3.0","database":"postgresql","meta":false,"graph_version":"v26.0"}
```

`meta:false` es normal hasta añadir las credenciales de Meta.

## 4. Crea/configura la App de Meta

En Meta for Developers crea una App orientada a negocio y configura Facebook Login / Facebook Login for Business y la API de Instagram con Facebook Login.

OmniSocial pide estos permisos:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

Para Instagram en este flujo, la cuenta debe ser Business o Creator y estar vinculada a una Página de Facebook.

## 5. Configura la URI OAuth

Tu URI exacta es:

```text
https://TU-SERVICIO.onrender.com/api/meta/oauth/callback
```

También puedes entrar en OmniSocial -> Mis redes. La V0.3 muestra la URI exacta que debes registrar.

Añádela en las URI de redirección OAuth válidas de la configuración de Login de Meta.

## 6. Añade variables en Render

Render -> omnisocial -> Environment:

```text
META_APP_ID = App ID de Meta/Facebook
META_APP_SECRET = App Secret
META_GRAPH_VERSION = v26.0
```

Si utilizas Facebook Login for Business, crea una Login Configuration que contenga los permisos anteriores y añade:

```text
META_LOGIN_CONFIG_ID = tu Configuration ID
```

Cuando esta variable existe, OmniSocial usa `config_id` en el diálogo de Business Login en lugar de enviar la lista `scope` dinámicamente.

`TOKEN_ENCRYPTION_KEY` debe existir también. Si actualizas mediante Blueprint, `render.yaml` la genera automáticamente. Si haces cambios manuales y no existe, crea una cadena aleatoria larga.

No publiques el App Secret ni la clave de cifrado en GitHub.

## 7. Prueba la conexión

1. Entra en OmniSocial.
2. Abre `Mis redes`.
3. Pulsa `Conectar Meta`.
4. Autoriza los permisos.
5. Si administras varias Páginas, OmniSocial te pedirá elegir una.
6. Comprueba que Facebook aparece `Conectado`.
7. Si la Página tiene una cuenta Business/Creator de Instagram vinculada, Instagram también aparecerá `Conectado`.

## 8. Prueba la publicación real

Crea primero una publicación sencilla para Facebook.

Después prueba una imagen marcando Facebook e Instagram.

En `Distribución` verás:

- Pendiente
- Publicando...
- Publicado
- Error

Si falla, se muestra el mensaje y aparece `Reintentar`.

## 9. Modo desarrollo y producción

Mientras la App de Meta esté en modo Development, normalmente solo podrán usarla usuarios con un rol/tester en la App y activos relacionados con ella.

Para abrir OmniSocial a usuarios reales externos tendrás que completar App Review/Advanced Access para los permisos solicitados y cualquier requisito de negocio que Meta aplique.
