# Instant Admirers V1.7.0

## V1.7

Centro de lanzamiento, checklist de salida, fases, cohorte inicial y banner controlado.

## URLs públicas de perfil

Cada usuario dispone ahora de una URL directa y fácil de compartir:

```text
https://instantadmirers.com/nombredeusuario
```

### Comportamiento

- Si el visitante ya ha iniciado sesión, entra directamente al perfil.
- Si no ha iniciado sesión, ve acceso/registro y, al entrar, continúa automáticamente al perfil.
- Se respetan cuenta privada, bloqueos y retos de acceso.
- La invitación especial a un perfil utiliza también la URL limpia `/usuario`.
- Los enlaces antiguos `?profile=usuario` continúan funcionando y se convierten al formato nuevo.
- Desde el menú del perfil se puede compartir/copiar la URL pública.

## Compatibilidad

No hay migraciones de PostgreSQL. Se conserva toda la información de V1.2.4.

Consulta `ACTUALIZAR-A-V1.2.8.md`.


## V1.2.6
Rediseño responsive del panel de acceso especial por invitaciones.


## V1.2.8

Portada móvil más expresiva y premium sin alterar el escritorio ni la base de datos.

## V1.3 — Multimedia fuera de PostgreSQL
- Cloudinary como proveedor multimedia principal cuando `CLOUDINARY_URL` está configurada.
- Fotos y vídeos nuevos se guardan fuera de PostgreSQL.
- Compatibilidad transparente con archivos antiguos.
- Migración segura mediante `npm run migrate:media`.
- Consulta `ACTUALIZAR-A-V1.3.md` antes de migrar el histórico.

## V1.4 — Rendimiento
- Paginación del feed, perfiles, Descubrir, Reels y Guardados.
- Scroll infinito.
- Lazy loading de vídeos e imágenes.
- Entrega directa desde Cloudinary/CDN para multimedia de posts y Stories.
- Reels reproducidos únicamente al estar visibles.
- Consultas SQL e índices optimizados.
- Caché de assets y panel lateral.
- Consulta `ACTUALIZAR-A-V1.4.md`.



## V1.5 — PWA instalable
- Instalación desde Android, iPhone/iPad y navegadores de escritorio compatibles.
- Service Worker y app shell público.
- Arranque offline sin borrar la sesión.
- Botón Instalar app en acceso y Ajustes.
- Iconos maskable para Android.
- Consulta `ACTUALIZAR-A-V1.5.md`.
