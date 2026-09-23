# Instant Admirers V1.12.0 — Protección de contenido

V1.12.0 refuerza la entrega de fotos y vídeos para que el contenido de usuarios no dependa de URLs públicas permanentes de Cloudinary.

## Qué protege

- Las nuevas fotos y vídeos de usuarios se suben a Cloudinary como recursos `authenticated`.
- Feed, perfiles, Stories, Reels, Guardados, compartidos y mensajes reciben una URL temporal de Instant Admirers, no la URL original de Cloudinary.
- La URL temporal está firmada, caduca y queda vinculada a la sesión del usuario que la está viendo.
- Antes de servir cada recurso, el servidor vuelve a comprobar si ese usuario tiene permiso para ver el post, Story o conversación correspondiente.
- Los archivos Cloudinary se entregan mediante proxy del servidor: el navegador no recibe la URL privada de origen.
- `/media/:id` deja de servir libremente multimedia de posts, Stories o mensajes. Se conserva únicamente para avatar y portada del perfil por compatibilidad.
- Los vídeos protegidos desactivan descarga visible, Picture-in-Picture y reproducción remota cuando el navegador lo permite.
- Imágenes y vídeos protegidos bloquean arrastre y menú contextual como medida de disuasión adicional.

## Marca de agua

Cada usuario puede elegir en Privacidad:

- **Solo en perfil exclusivo** (valor por defecto): marca el contenido de perfiles con acceso especial.
- **En todo mi contenido**.
- **Sin marca visible**.

Cuando corresponde, se superpone `@usuario_que_mira · instantadmirers.com` en dos zonas del contenido para desincentivar capturas y redistribución.

La marca visual es una medida de disuasión. No es DRM y un usuario técnicamente avanzado puede manipular su propio navegador.

## Multimedia antigua

Al arrancar V1.12.0, el servidor busca multimedia Cloudinary de versiones anteriores con tipo público `upload` y, en segundo plano, intenta convertirla a `authenticated` con invalidación de CDN. La aplicación arranca aunque alguna conversión falle; lo pendiente se reintenta en el siguiente arranque.

También queda disponible el comando manual:

```bash
npm run harden:media
```

Puede desactivarse temporalmente la conversión automática con:

```env
HARDEN_LEGACY_MEDIA_ON_START=false
```

## Configuración

```env
MEDIA_URL_TTL_SECONDS=1800
HARDEN_LEGACY_MEDIA_ON_START=true
```

`MEDIA_URL_TTL_SECONDS` admite entre 300 y 3600 segundos.

## Límite real de la protección

Ninguna web puede impedir al 100 % que una persona que ya puede ver una imagen o vídeo haga una captura de pantalla, grabe la pantalla o utilice herramientas avanzadas del navegador. V1.12.0 está diseñada para:

1. impedir el acceso sin autorización;
2. evitar URLs públicas permanentes para contenido nuevo;
3. invalidar progresivamente URLs antiguas;
4. dificultar la descarga casual;
5. desincentivar filtraciones mediante marca de agua identificable.

La seguridad importante está en el servidor; bloquear clic derecho por sí solo no se considera una medida de seguridad.
