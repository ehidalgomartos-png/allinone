# Actualizar Instant Admirers a V1.4.0

V1.4 está centrada en rendimiento. Parte directamente de la V1.3.2 estable y no cambia la configuración de Cloudinary, Resend ni PostgreSQL.

## Qué cambia

- Feed `Siguiendo` paginado: ya no descarga decenas de publicaciones de golpe.
- Feed `Para ti` paginado y limitado a un conjunto reciente de candidatos antes de calcular recomendaciones.
- Scroll infinito en Inicio, Descubrir, Reels, perfiles y Guardados.
- Perfiles paginados con cursor por ID para evitar consultas cada vez más pesadas.
- Reels cargados en bloques pequeños y reproducción solo del vídeo visible.
- Los vídeos normales empiezan con `preload=none` y cargan metadatos solo al acercarse a la pantalla.
- Los vídeos que salen de la zona visible se pausan automáticamente.
- Las imágenes de publicaciones almacenadas en Cloudinary usan entrega directa por CDN y transformación automática `f_auto/q_auto` con límite de anchura.
- Stories nuevas también reciben URL directa CDN cuando están en Cloudinary.
- El navegador deja de pasar por Render para cada imagen de publicación de Cloudinary.
- Caché de 45 segundos para el panel derecho de sugerencias/tendencias para evitar repetir consultas al navegar.
- Caché HTTP de una semana para JS/CSS/iconos, con `?v=1.4.0` para evitar archivos antiguos tras el despliegue.
- Nuevos índices PostgreSQL para feed, perfiles, Reels, comentarios, likes, bookmarks, Stories y mensajes.
- Las consultas principales del feed primero seleccionan un bloque pequeño de posts y después calculan likes/comentarios.

## No tienes que hacer

- No crees otro Render.
- No crees otra base de datos.
- No cambies `DATABASE_URL`.
- No cambies `CLOUDINARY_URL`.
- No ejecutes `npm run migrate:media`.
- No hay una migración manual.

Los índices nuevos se crean automáticamente al arrancar porque `initDb()` ejecuta `src/schema.sql`.

## Actualización

1. Descomprime `Instant-Admirers-V1.4-Rendimiento.zip`.
2. Sustituye los archivos del repositorio GitHub actual por los del ZIP, igual que en versiones anteriores.
3. Haz commit en `main`.
4. Espera a que Render termine el despliegue.
5. Abre:

   `https://instantadmirers.com/api/health`

6. Debe aparecer:

```json
"version":"1.4.0"
```

Y debe seguir apareciendo:

```json
"media":{"configured":true,"provider":"cloudinary"}
```

## Pruebas después del despliegue

Haz estas pruebas en ordenador y móvil:

1. Inicio → Siguiendo: desplázate hacia abajo y comprueba que aparecen más publicaciones automáticamente.
2. Inicio → Para ti: desplázate y comprueba la carga automática.
3. Descubrir: comprueba el scroll infinito.
4. Reels: baja varios vídeos. Solo el Reel visible debe reproducirse automáticamente; los demás deben quedar pausados.
5. Abre un perfil con muchas publicaciones y baja por el perfil.
6. Abre Guardados y desplázate si hay suficientes elementos.
7. Publica una foto nueva y un vídeo nuevo para confirmar que Cloudinary continúa funcionando.
8. Comprueba mensajes y Stories.

## Cambio de API interno

En V1.4 los endpoints paginados devuelven un objeto con esta forma:

```json
{
  "items": [],
  "has_more": true,
  "next_cursor": "123"
}
```

o, para las vistas ordenadas por puntuación:

```json
{
  "items": [],
  "has_more": true,
  "next_offset": 15
}
```

La interfaz V1.4 ya está adaptada. Este dato solo importa si en el futuro se crea otra app o cliente que consuma directamente la API.

## Base de datos

No se eliminan tablas ni columnas. Solo se añaden índices con `CREATE INDEX IF NOT EXISTS`, por lo que la actualización es compatible con la base existente.

## Volver atrás

Si apareciera un problema inesperado, puedes volver a desplegar V1.3.2. Los índices añadidos por V1.4 pueden quedarse en PostgreSQL: no rompen V1.3.2 y no es necesario borrarlos.
