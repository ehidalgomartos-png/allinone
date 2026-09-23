# Actualizar Instant Admirers a V1.9.4

## Qué cambia

V1.9.4 parte exclusivamente de V1.9.3 y realiza un ajuste de claridad en la interfaz:

1. El botón **Conexiones** del perfil ahora se llama **Personas**.
2. La pantalla **Amigos y conexiones** ahora se llama **Personas**.
3. Dentro de ella se mantienen las secciones **Siguiendo**, **Te siguen**, **Tus amigos** y las solicitudes correspondientes.

No cambia ninguna relación ni estructura de datos.

## Instalación

1. Descomprime el ZIP V1.9.4.
2. Sustituye los archivos del mismo repositorio GitHub.
3. Haz commit en `main`.
4. Espera el despliegue automático de Render.
5. No cambies PostgreSQL, Cloudinary, Resend ni DNS.

## Comprobación

Abre:

`https://instantadmirers.com/api/health`

Debe indicar:

`"version":"1.9.4"`

## Prueba recomendada

1. Entra en tu perfil y comprueba que aparece el botón **Personas**.
2. Pulsa **Personas**.
3. La pantalla debe titularse **Personas**.
4. Comprueba las secciones **Siguiendo**, **Te siguen** y **Tus amigos**.
5. Vuelve a probar los contadores laterales **Seguidores** y **Siguiendo**.

La caché PWA también sube a V1.9.4 para que el navegador recoja el cambio de interfaz tras el despliegue.
