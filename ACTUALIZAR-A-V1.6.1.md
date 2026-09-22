# Actualizar Instant Admirers V1.6.0 → V1.6.1

## Qué añade

V1.6.1 incorpora un **Laboratorio de pruebas** para validar Instant Admirers antes de invitar usuarios reales.

Desde **Administración → Laboratorio de pruebas** puedes generar temporalmente:

- 24 perfiles sintéticos claramente identificados como `TEST`.
- 144 publicaciones distribuidas durante varios días.
- 18 vídeos/Reels.
- 12 Stories activas.
- Likes y comentarios de prueba.
- Una red de seguimientos para alimentar recomendaciones.
- Algunos mensajes de prueba con la cuenta administradora.

Las métricas de **Lanzamiento controlado** excluyen estas cuentas, así que los números de usuarios y actividad real no se falsean.

## Actualización

1. Sustituye los archivos de V1.6.0 por los de este ZIP en el mismo repositorio GitHub.
2. Haz commit en `main`.
3. Espera al deploy de Render.
4. No cambies PostgreSQL, Cloudinary, Resend ni variables de entorno.
5. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.6.1"`.
6. Entra en **Administración** y busca **Laboratorio de pruebas**.

La base de datos añade automáticamente dos campos seguros a `users`: `is_demo` y `demo_batch`.

## Cómo probar

Pulsa **Generar datos de prueba**. El proceso puede tardar unos segundos.

Después prueba:

- Inicio / Siguiendo: tu administrador seguirá automáticamente varias cuentas TEST.
- Descubrir: debe mostrar perfiles y publicaciones de prueba.
- Reels: tendrás al menos 18 vídeos de prueba.
- Stories: aparecerán Stories activas.
- Buscar: busca `test_` o uno de los perfiles.
- Mensajes: aparecerán algunas conversaciones TEST.

## Limpieza

Cuando termines, vuelve a **Administración → Laboratorio de pruebas** y pulsa **Eliminar datos de prueba**.

La limpieza elimina únicamente usuarios marcados `is_demo=TRUE`. Por claves foráneas con borrado en cascada se eliminan también sus posts, Stories, Reels, likes, comentarios, seguimientos, mensajes y multimedia demo. **No elimina usuarios reales ni contenido real.**

Los archivos gráficos/vídeos demo incluidos en el código son recursos estáticos pequeños y pueden quedarse en el repositorio; no ocupan Cloudinary ni PostgreSQL como binarios.
