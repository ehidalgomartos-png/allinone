# Instant Admirers V1.10.0 — Sistema de Publicidad

## Novedades

- Nueva sección **Administración → Publicidad**.
- Interruptor general para mostrar u ocultar toda la publicidad.
- Banners de imagen subidos desde el ordenador (Cloudinary) o cargados mediante URL.
- Imagen móvil opcional diferente de la de escritorio.
- URL de destino para banners propios.
- Bloques de Google AdSense mediante el código oficial del anuncio.
- Ubicaciones configurables: columna derecha, feed y perfiles.
- Dispositivos configurables: ordenador y móvil.
- Segmentación por perfil: todos, solo perfiles seleccionados o todos excepto seleccionados.
- Programación opcional con fecha de inicio y fin.
- Prioridad para decidir qué campaña se sirve primero.
- Activar, desactivar, editar, previsualizar y eliminar campañas.
- Impresiones, clics y CTR para banners propios. Los clics de AdSense se consultan en Google.
- Si el sistema está apagado o no existe un anuncio válido para una ubicación, no se crea ningún hueco visible.

## Colocación inicial

- **Ordenador:** banner en la columna derecha entre “Personas para ti” y “Tendencias”, y opcionalmente dentro del feed.
- **Móvil:** publicidad dentro del feed y/o bajo la cabecera de un perfil. No se usa banner fijo inferior para no interferir con la navegación.
- **Perfil concreto:** activa la ubicación “En perfiles”, elige “Solo perfiles seleccionados” y busca uno o varios @usuarios.

## Google AdSense

La administración acepta el bloque oficial de AdSense que contiene `adsbygoogle`, `data-ad-client` y `data-ad-slot`. Por seguridad, el cliente reconstruye únicamente el elemento oficial de AdSense y carga solo el script de `pagead2.googlesyndication.com`.
