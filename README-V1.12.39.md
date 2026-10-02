# Instant Admirers V1.12.39 — Descubrir 2.0

Base: **V1.12.38 estable**.

## Objetivo

Hacer que Descubrir muestre personas y contenido más relevante, variado y menos repetitivo sin utilizar ubicación precisa.

## Novedades

- Filtros de personas: **Para ti**, **Tu ciudad**, **Activos** y **Nuevos**.
- El filtro **Tu ciudad** usa únicamente el texto de ciudad guardado en el perfil. No solicita GPS ni ubicación exacta.
- Ranking de personas con señales de intereses, ciudad, conexiones reales, actividad reciente, calidad del perfil y afinidad previa.
- Rotación automática de perfiles ya mostrados para evitar ver siempre las mismas sugerencias.
- Botón **Cambiar** para pedir otra tanda de sugerencias.
- Botón **×** para ocultar permanentemente una sugerencia que no interesa.
- Mezcla de perfiles reales y virtuales: si existen suficientes perfiles reales, se reserva al menos la mitad de la tanda para cuentas reales.
- Señales visuales en tarjetas: actividad reciente, ciudad, intereses o conexiones en común.
- Contenido público de Descubrir reordenado por afinidad, intereses, ciudad, conversación reciente y frescura.
- Penalización de varias publicaciones seguidas del mismo autor para aumentar variedad.
- Las interacciones generadas por perfiles virtuales **no aumentan el ranking** de publicaciones en Descubrir.
- ES/EN y modo claro/oscuro actualizados.

## Base de datos

Se crean automáticamente al arrancar:

- `discovery_profile_impressions`
- `discovery_profile_dismissals`

No hay SQL manual.

## Validación recomendada

1. Comprobar `/api/health` y `version: "1.12.39"`.
2. Abrir **Descubrir** y probar los cuatro filtros.
3. Pulsar **Cambiar** y comprobar que rota perfiles.
4. Ocultar una sugerencia con `×` y confirmar que no reaparece.
5. Si el perfil tiene ciudad, probar **Tu ciudad**.
6. Revisar varias publicaciones para comprobar que aparecen autores variados y motivos como “Coincide con tus intereses”.
