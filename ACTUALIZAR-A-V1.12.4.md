# Actualizar a V1.12.4

1. Sustituye los archivos de la versión anterior por los de este ZIP.
2. No borres PostgreSQL ni Cloudinary.
3. Las nuevas columnas y la tabla de atribución se crean automáticamente al iniciar.
4. Despliega en Render.
5. Comprueba `/api/health`: debe mostrar `1.12.4` y las funciones `campaign-access-message`, `growth-source-attribution`, `growth-utm-tracking` y `growth-visit-details`.
6. Haz una recarga completa del navegador o vuelve a abrir la PWA para cargar la caché V1.12.4.

## Prueba recomendada
- En **Administración → Growth Engine**, crea o edita una campaña.
- Escribe un **Mensaje de acceso** propio y, si quieres, una **Pieza / origen** como `story-01`.
- Copia el enlace generado y ábrelo sin sesión.
- En la tarjeta del perfil exclusivo debe aparecer exactamente el mensaje de esa campaña tanto en **Entrar** como en **Crear cuenta**.
- Vuelve al Growth Engine y abre **Ver procedencia de las visitas**.
- Debe aparecer la nueva visita con su fuente, dispositivo y, si existe, referrer/UTM.
- Registra una cuenta desde ese mismo enlace y comprueba que aumenta `registros` y la conversión de esa fuente.

## Compatibilidad histórica
Las visitas y registros anteriores al despliegue siguen contando en los totales. Como no existía detalle de procedencia, V1.12.4 los agrupa como **“histórico sin origen”**.
