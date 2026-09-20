# OmniSocial V0.8 — Para ti y recomendaciones

V0.8 mantiene todo lo existente en V0.7.1 y añade una capa de descubrimiento personalizado dentro de la red propia.

## Novedades

- Feed de Inicio con dos modos: **Siguiendo** y **Para ti**.
- `Para ti` ordena contenido público usando señales explicables: intereses, cuentas seguidas, likes, comentarios, guardados, conexiones en común, actividad del post y recencia.
- Cada post recomendado puede mostrar por qué aparece.
- Nueva API `/api/for-you`.
- Nueva API `/api/suggestions`.
- **Personas para ti** en Descubrir y en la columna lateral de escritorio.
- Las sugerencias tienen motivos como intereses comunes, conexiones en común o interacción previa.
- Descubrir separa personas recomendadas, tendencias y publicaciones populares.
- Si el perfil no tiene intereses, OmniSocial muestra una invitación compacta para añadirlos.
- V0.7.1 se conserva completa: perfiles, eliminación de avatar/portada, Stories, Reels, mensajes, amigos, tiempo real, menciones, hashtags, reposts y edición.

## Persistencia

No se borran ni recrean tablas. La V0.8 solo añade índices auxiliares para acelerar recomendaciones.

## Despliegue

Usa el mismo repositorio GitHub, Web Service de Render y PostgreSQL. Sustituye los archivos, haz commit y espera el Auto Deploy.

Comprueba después:

```text
https://TU-SERVICIO.onrender.com/api/health
```

Debe responder con `version: "0.8.0"`.
