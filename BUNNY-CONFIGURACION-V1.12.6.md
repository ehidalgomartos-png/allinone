# Configuración Bunny — Instant Admirers V1.12.6

No copies ninguna clave secreta en chats, GitHub ni archivos públicos. Las claves se pegan únicamente en **Render → Environment**.

## 1. Bunny Storage — imágenes

Valores conocidos:

```text
BUNNY_STORAGE_ZONE=instant-admirers-media
BUNNY_STORAGE_ENDPOINT=https://storage.bunnycdn.com/instant-admirers-media
BUNNY_CDN_HOST=instant-admirers-media.b-cdn.net
```

Secretos que debes copiar desde Bunny a Render:

```text
BUNNY_STORAGE_KEY=<Password normal del Storage Zone>
BUNNY_CDN_TOKEN_KEY=<Url token authentication Key de la Pull Zone>
```

En la Pull Zone de imágenes:

```text
Token authentication: ON
Token IP validation: OFF
```

## 2. Bunny Stream — vídeos

Valores conocidos:

```text
BUNNY_STREAM_LIBRARY_ID=761236
BUNNY_STREAM_CDN_HOST=vz-db3f5e78-953.b-cdn.net
```

Secretos:

```text
BUNNY_STREAM_API_KEY=<API Key normal, no la read-only>
BUNNY_STREAM_TOKEN_KEY=<Token authentication key>
```

### Ajustes de Stream para V1.12.6

V1.12.6 usa **su propio reproductor HLS**, no el iframe de Bunny. Por ello `Enable direct play` debe estar **ON** para que Bunny exponga los HLS. La seguridad no depende de que el HLS sea público: `CDN token authentication` obliga a llevar un token firmado que caduca.

Configuración recomendada:

```text
Enable direct play: ON
CDN token authentication: ON
Embed view token authentication: ON
Allowed domains: instantadmirers.com y *.instantadmirers.com
Block direct url file access: OFF
```

`Block direct url file access` se deja OFF porque los reproductores HLS nativos de algunos dispositivos Apple pueden no enviar el referrer esperado. El acceso sigue protegido por token temporal. Si tras las pruebas de iOS quieres endurecerlo, se puede volver a evaluar.

> Esta recomendación sustituye la indicación provisional anterior de dejar Direct Play apagado. Al integrar el reproductor propio de V1.12.6 hemos confirmado que necesitamos los HLS directos protegidos por token.

## 3. Webhook — opcional

No es obligatorio: Instant Admirers consulta el estado del vídeo cada 30 segundos.

Si quieres usar webhook, crea un secreto largo en Render:

```text
BUNNY_STREAM_WEBHOOK_SECRET=<secreto aleatorio>
```

Y en Bunny Stream configura:

```text
https://instantadmirers.com/api/bunny/stream/webhook?secret=EL_MISMO_SECRETO
```

No envíes ese secreto por chat.

## 4. Cloudinary durante la transición

```text
CLOUDINARY_URL=<puede conservarse temporalmente para archivos antiguos>
ALLOW_CLOUDINARY_UPLOAD_FALLBACK=false
HARDEN_LEGACY_MEDIA_ON_START=false
```

Así una mala configuración de Bunny **no hará que una foto o vídeo nuevo vuelva accidentalmente a Cloudinary**.

## 5. Comprobación en `/api/health`

Con las cuatro credenciales Bunny correctas debe aparecer algo equivalente a:

```json
"version": "1.12.6",
"media": {
  "configured": true,
  "images": "bunny_storage",
  "videos": "bunny_stream",
  "legacy_cloudinary": true,
  "cloudinary_upload_fallback": false
}
```

`legacy_cloudinary` puede ser `false` si finalmente eliminas `CLOUDINARY_URL` después de resolver/migrar todo el contenido histórico.
