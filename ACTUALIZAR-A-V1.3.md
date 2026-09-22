# Actualizar Instant Admirers V1.2.10 → V1.3

## Objetivo
V1.3 mueve fotos y vídeos nuevos a Cloudinary. PostgreSQL conserva únicamente metadatos y referencias. Los archivos antiguos siguen funcionando hasta que ejecutes la migración.

## 1. Antes de subir el ZIP
1. Crea o entra en tu cuenta de Cloudinary.
2. En el panel de Cloudinary abre la sección de API Keys / API Environment variable.
3. Copia el valor completo de `CLOUDINARY_URL`.
4. No publiques ese valor ni lo subas a GitHub.

## 2. Configura Render
En Render → `omnisocial` → Environment añade:

`CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME`

Mantén las variables actuales (`DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, etc.).

## 3. Despliega V1.3
1. Sube el contenido de este ZIP al mismo repositorio GitHub `allinone`.
2. Haz commit en `main`.
3. Espera al Auto Deploy de Render.
4. Abre `https://instantadmirers.com/api/health`.

Debe aparecer:

```json
"version":"1.3.0",
"media":{"configured":true,"provider":"cloudinary"}
```

## 4. Prueba archivos nuevos ANTES de migrar los antiguos
Haz estas pruebas:
- cambiar foto de perfil;
- cambiar portada;
- publicar una foto;
- publicar un vídeo corto;
- crear una Story;
- enviar una imagen por mensaje.

Si todo carga correctamente, los archivos nuevos ya están fuera de PostgreSQL.

## 5. Migra los archivos antiguos
Como tu Web Service es de pago, Render permite abrir una shell desde el Dashboard.

En Render → `omnisocial` → Shell ejecuta:

```bash
npm run migrate:media
```

El script:
- busca solo archivos que todavía tienen binario en PostgreSQL;
- sube uno por uno a Cloudinary;
- actualiza URL y metadatos;
- solo entonces pone `data=NULL`;
- si un archivo falla, conserva el original y se detiene para no perder datos.

Puedes volver a ejecutar el comando las veces que haga falta.

## 6. Comprobar la migración
Si eres administrador, con sesión iniciada puedes consultar:

`GET /api/admin/media-storage`

Al terminar debe indicar `legacy_in_postgresql: 0`.

## Seguridad
- `CLOUDINARY_URL` debe existir solo en Render Environment.
- No copies API Secret al código, GitHub, capturas públicas o chats.
- Si no configuras Cloudinary, V1.3 mantiene temporalmente el almacenamiento antiguo en PostgreSQL para que la web no se rompa.
