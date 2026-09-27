# Actualizar a V1.12.24

Base requerida: **V1.12.23**.

## Pasos

1. Conserva una copia de V1.12.23 antes de sustituir archivos.
2. Sube todos los archivos de V1.12.24 al mismo repositorio.
3. Espera a que Render finalice el despliegue.
4. Comprueba:
   - `/api/health` → `version: "1.12.24"`;
   - que la aplicación inicia sin errores;
   - Administración → Comunidad virtual;
   - botón `Imágenes` de los perfiles virtuales.
5. En `@lucia.vidal.01` verifica el pack piloto: avatar + portada + 4 fotografías para posts.
6. Genera actividad de prueba desde administración y comprueba la rotación del pool visual.

## Base de datos

No ejecutar SQL manualmente. El arranque aplica las columnas/tablas nuevas de forma idempotente.

## Render / variables

No hay variables de entorno nuevas. Se reutiliza la configuración multimedia actual (Bunny Storage / compatibilidad existente).

## Importante

No considerar V1.12.24 estable hasta comprobarla en producción. Mientras tanto, V1.12.23 sigue siendo la base de retorno.
