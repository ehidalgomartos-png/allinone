# Actualizar Instant Admirers V1.4.0 → V1.5.0

## Qué añade V1.5
- Instalación como PWA en Android, iPhone/iPad y navegadores de escritorio compatibles.
- Service Worker propio y shell básico de la aplicación.
- Iconos `maskable` para Android.
- Botón **Instalar app** en el acceso y en Ajustes de cuenta.
- Instrucciones específicas para iPhone/iPad.
- Arranque offline seguro: si no hay red, no se borra la sesión.
- Caché únicamente de la carcasa/recursos estáticos; `/api`, Socket.IO y multimedia privada no se guardan en el Service Worker.

## Actualización
1. Sustituye los archivos de tu repositorio por los de este ZIP.
2. Haz commit en `main`.
3. Espera el despliegue automático de Render.
4. No cambies PostgreSQL, Cloudinary ni las variables de entorno.
5. Comprueba `https://instantadmirers.com/api/health`: debe indicar `version: 1.5.0`.

## Prueba Android
1. Abre `https://instantadmirers.com` en Chrome.
2. Entra en tu cuenta → Perfil → Ajustes → **Instalar app**.
3. Confirma la instalación.
4. Abre Instant Admirers desde el icono creado en el teléfono.

## Prueba iPhone/iPad
1. Abre la web en Safari.
2. En Ajustes pulsa **Instalar app** para ver la guía.
3. Safari → Compartir → **Añadir a pantalla de inicio** → Añadir.

## Importante
V1.5 no convierte Instant Admirers en una app de App Store/Google Play. Es una PWA instalada desde la web. Más adelante, si interesa, se puede empaquetar para las tiendas.
