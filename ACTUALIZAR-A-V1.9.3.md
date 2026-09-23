# Actualizar Instant Admirers a V1.9.3

## Qué corrige

V1.9.3 corrige dos problemas de usabilidad detectados en V1.9.2:

1. Los contadores de **Seguidores** y **Siguiendo** de la tarjeta lateral ahora se muestran como controles claramente interactivos y abren su lista correspondiente.
2. La pantalla **Amigos** pasa a ser **Amigos y conexiones** y muestra también:
   - Personas que sigues.
   - Personas que te siguen.
   - Solicitudes de amistad recibidas y enviadas.
   - Amigos confirmados.

Seguir a una persona y ser amigos siguen siendo relaciones distintas. La nueva pantalla las reúne en un solo lugar para que sea fácil encontrarlas.

## Instalación

1. Descomprime el ZIP V1.9.3.
2. Sustituye los archivos del mismo repositorio GitHub.
3. Haz commit en `main`.
4. Espera el despliegue automático de Render.
5. No cambies PostgreSQL, Cloudinary, Resend ni DNS.

## Comprobación

Abre:

`https://instantadmirers.com/api/health`

Debe indicar:

`"version":"1.9.3"`

Y las funciones nuevas:

- `connections-hub`
- `following-in-friends`
- `profile-stat-links-fix`
- `pwa-auto-refresh`

## Prueba recomendada

1. En la tarjeta **Tu perfil**, pulsa `Siguiendo`.
2. Debe abrirse la lista de personas que sigues.
3. Pulsa `Seguidores` y comprueba la lista correspondiente.
4. Entra en tu perfil y pulsa **Conexiones**.
5. Comprueba que aparecen las secciones **Siguiendo**, **Te siguen** y **Tus amigos**.

V1.9.3 también fuerza una actualización más fiable del cliente cuando cambia el Service Worker, para reducir casos en los que el navegador conserva una interfaz de la versión anterior tras un despliegue.
