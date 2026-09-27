# Instant Admirers V1.12.24 — Virtual Profile Image System

## Novedades

- Biblioteca visual completa para cada anfitrión virtual.
- Tipos de imagen: `avatar`, `cover`, `post`, `story`, `teaser` y `gallery`.
- Etiquetas temáticas por imagen para relacionar contenido e imagen (`cine`, `playa`, `café`, `gastronomía`, ciudad, etc.).
- Texto alternativo, destacado, orden, activo/archivado y contador de usos.
- Historial de uso por imagen con referencia a post/Story.
- Selección automática de imagen para la actividad virtual según:
  - coincidencia entre etiquetas y texto,
  - imágenes menos utilizadas,
  - tiempo desde el último uso,
  - penalización para evitar repeticiones en pocos días.
- Panel `Administración → Comunidad virtual → Imágenes`.
- Subida múltiple de hasta 20 imágenes desde el gestor visual.
- Acciones de administración: guardar metadatos, elegir avatar, elegir portada, destacar, archivar, restaurar y borrar del pool.
- Las publicaciones históricas conservan sus medios aunque se retire una imagen del pool.
- Integración con Bunny Storage cuando está configurado y fallback existente de la aplicación.
- Avatar y portada continúan sirviéndose mediante `/media/{id}` y el resto mediante entrega protegida.

## Piloto visual incluido

Se incluye el primer pack consistente para `@lucia.vidal.01`:

1. avatar fotográfico sintético;
2. portada en Málaga al atardecer;
3. foto en café;
4. foto en la costa;
5. noche de cine;
6. gastronomía/tapas.

Las cuatro escenas SVG iniciales de Lucía se archivan automáticamente al instalar el piloto. No se borran para conservar referencias históricas.

Las fotografías son sintéticas y el perfil continúa identificado expresamente como `Perfil virtual` / `Anfitrión virtual`.

## Base de datos

La inicialización idempotente añade metadatos a `virtual_profile_media` y crea `virtual_profile_media_usage`.

No hace falta ejecutar una migración manual: `src/schema.sql` se aplica durante el arranque normal.

## SEO

- Conserva todo el SEO dinámico de V1.12.23.
- Corrige además la hidratación de `html lang` de los perfiles públicos: la página SEO renderizada en español mantiene `lang="es"` incluso si el rastreador usa un navegador configurado en inglés.
- El avatar realista asignado al perfil se convierte también en la imagen social/SEO utilizada por la lógica existente de perfil público.

## Versión

- `/api/health`: `1.12.24`
- Service Worker/cache: `instant-admirers-v1.12.24`
- Sin nuevas variables de entorno.
