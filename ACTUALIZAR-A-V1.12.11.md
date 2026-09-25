# Actualizar a Instant Admirers V1.12.11

Base: V1.12.10.

## Cambio
- Corrige la vista pública teaser de Growth Engine en escritorio.
- El problema venía de que `.public-teaser-page` heredaba el grid de dos columnas de `.auth-page`, desplazando cabecera y contenido a columnas distintas.
- En escritorio el teaser ahora usa un layout propio, centrado y de ancho cómodo.
- Móvil mantiene el diseño de V1.12.10 sin cambios.

No requiere nuevas variables de entorno ni migraciones manuales.
