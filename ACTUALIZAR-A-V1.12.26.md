# Actualizar a V1.12.26

1. Partir de la V1.12.25 desplegada y validada.
2. Sustituir los archivos del repositorio por los de esta versión.
3. Commit + push a GitHub y esperar al despliegue de Render.
4. Comprobar `/api/health`: debe indicar `1.12.26`.
5. Entrar en `Administración → Comunidad virtual`.
6. Comprobar que aparecen los contadores `packs realistas` y `fotos realistas`.
7. Usar `Importar packs fotográficos realistas` con un ZIP que cumpla el manifest V1.
8. Para la primera prueba se recomienda un lote pequeño de 1–2 perfiles; después pueden importarse tandas de hasta 10.

No se necesitan nuevas variables de entorno ni migraciones SQL manuales.
