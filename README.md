# OmniSocial V1.1 — Calidad y estabilidad

V1.1 parte de OmniSocial V1.0.1 y se centra en pulir la experiencia sin añadir migraciones destructivas ni alterar los datos existentes.

## Mejoras principales

- Esqueletos de carga para evitar pantallas vacías mientras llegan los datos.
- Barra superior de actividad para indicar peticiones en curso.
- Mejor comportamiento cuando Render gratuito está despertando o responde lento.
- Aviso visible si el dispositivo pierde la conexión y cuando se recupera.
- Detección de sesión caducada y retorno seguro al inicio de sesión.
- Likes y guardados sin recargar todo el feed ni perder la posición de scroll.
- Protección contra dobles envíos en login, registro, comentarios y mensajes.
- Escape cierra modales y el visor de Stories.
- Cabeceras básicas de seguridad y respuestas API sin caché privada.
- Respeta `prefers-reduced-motion` para usuarios que reducen animaciones.

## Base de datos

V1.1 no necesita nuevas tablas. Se conserva la PostgreSQL actual.

## Despliegue

Sustituye los archivos del repositorio actual y haz commit. Render hará el deploy automáticamente. No borres la base de datos.

Comprueba después:

```text
https://omnisocial-rwn6.onrender.com/api/health
```

Debe mostrar `"version":"1.1.0"`.
