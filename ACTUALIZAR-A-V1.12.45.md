# Actualizar a V1.12.45

1. Parte de V1.12.44 estable.
2. Sube el PATCH a GitHub y despliega en Render.
3. No hay variables de entorno nuevas ni SQL manual. `src/schema.sql` añade únicamente un índice para los diagnósticos del motor 3.0.
4. Comprueba `/api/health` → `version: "1.12.45"`.
5. En Administración → Comunidad virtual abre `⚙ Motor actividad 3.0`.
6. Puedes pulsar `Generar actividad ahora` para crear una tanda de prueba y volver a abrir el panel.
7. Revisa después `❤ Salud comunidad`; el bloque `Actividad 3.0` mostrará eventos, perfiles, textos únicos y repeticiones exactas.

No es necesario reimportar fotos, tocar V4 REAL ni modificar la base de datos manualmente.
