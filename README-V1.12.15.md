# Instant Admirers V1.12.15 — Mobile Chat Composer Fix

Hotfix sobre V1.12.14 para la vista móvil del chat.

## Qué corrige

En algunos móviles, al abrir una conversación, el encabezado general de la página ocupaba altura adicional y empujaba el compositor por debajo del dock de navegación. V1.12.15 elimina ese encabezado únicamente mientras hay una conversación móvil abierta y recalcula la altura del chat para que el cuadro de mensaje y el botón Enviar sean siempre visibles.

No requiere nuevas variables de entorno ni cambios manuales de PostgreSQL.
