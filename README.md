# OmniSocial V0.5 — Stories, Reels y Mensajes

Versión centrada en convertir OmniSocial en una red social propia más completa.

## Novedades

- Stories de foto o vídeo con caducidad automática a las 24 horas.
- Stories públicas o solo para seguidores.
- Visualizaciones de tus propias Stories.
- Pestaña Reels con vídeos verticales de publicaciones existentes.
- Reproducción automática de Reels al entrar en pantalla.
- Mensajes privados 1 a 1.
- Envío de texto, fotografías y vídeos por mensaje.
- Contador de mensajes sin leer.
- Botón "Mensaje" en perfiles de otros usuarios.
- Diseño responsive para ordenador, tablet y móvil.
- Se conservan usuarios, posts, likes, comentarios, seguidores, guardados y notificaciones de V0.4.1.

## Arquitectura

- Node.js + Express
- PostgreSQL
- Frontend HTML/CSS/JavaScript sin framework
- JWT para sesiones
- Multer para subidas

## Arranque

```bash
npm install
npm start
```

Render utiliza `render.yaml` y la misma base `omnisocial-db`.

## Comprobación

`GET /api/health`

Debe devolver `version: "0.5.0"` y las funciones `stories`, `reels` y `messages`.

## Nota sobre multimedia

En este MVP, fotos y vídeos siguen almacenándose en PostgreSQL para que no se pierdan en reinicios de Render. El límite por archivo es 25 MB. Antes de crecer en usuarios conviene migrar multimedia a almacenamiento de objetos (por ejemplo S3/Cloudinary/R2) y dejar PostgreSQL para metadatos.
