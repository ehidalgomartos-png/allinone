# Actualizar Instant Admirers a V1.10.1

## Base

Esta versión debe desplegarse sobre la V1.10.0 preparada en este proyecto.

## Pasos

1. Sube el contenido completo de V1.10.1 al repositorio que Render despliega.
2. Espera a que Render termine el despliegue y reinicie la aplicación.
3. Comprueba `/api/health`: debe devolver `"version":"1.10.1"`.
4. Haz una recarga completa de la PWA/navegador. La caché ha cambiado a V1.10.1 y el Service Worker debe actualizarse automáticamente.
5. Entra desde una cuenta normal y busca el usuario Administrador en Descubrir, Buscar y Personas. No debe aparecer.
6. Comprueba Seguidores, Siguiendo, Amigos y solicitudes. Administrador no debe aparecer en ninguna lista.
7. Prueba la URL directa del perfil Administrador desde una cuenta normal: debe mostrarse como perfil no disponible.
8. Entra con la cuenta Administrador y confirma que el panel Administración sigue accesible y que la navegación la identifica como “Cuenta técnica”.

## Importante: limpieza social intencionada

Durante el arranque, V1.10.1 borra las relaciones sociales existentes asociadas a cuentas técnicas: follows, solicitudes, amistades, conversaciones, likes, guardados, bloqueos, silencios y visualizaciones de Stories. Es un cambio intencionado para que Administrador deje de formar parte del grafo social.

No se borran físicamente sus publicaciones ni comentarios históricos; simplemente quedan ocultos de la experiencia social normal.

## Base de datos

No hay que ejecutar SQL manualmente. `src/schema.sql` añade `social_hidden` y el servidor sincroniza automáticamente las cuentas de Administración.
