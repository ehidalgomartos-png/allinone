# Actualizar de V1.12.39 a V1.12.39.1

1. Parte de una instalación V1.12.39 funcionando.
2. Copia el contenido del ZIP PATCH sobre el repositorio, respetando las rutas.
3. Sube los cambios a GitHub y deja que Render despliegue la nueva versión.
4. Comprueba `/api/health`: debe mostrar `version: "1.12.39.1"`.
5. En Descubrir, revisa `Para ti`, `Tu ciudad`, `Activos` y `Nuevos`.
6. Comprueba que los perfiles reales válidos aparecen antes y los virtuales completan el resto.
7. En escritorio, verifica 3 tarjetas completas y los botones de desplazamiento.
8. Comprueba que `Personas para ti` de la columna derecha no repite los perfiles del carrusel principal.

No hay SQL manual ni nuevas variables de entorno.
