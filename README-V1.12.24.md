# Instant Admirers V1.12.24 — Virtual Profile Image System

Esta versión parte de **V1.12.23 — Virtual Profile Dynamic SEO Fix** y añade el sistema de identidad visual para anfitriones virtuales.

## Flujo de administración

Entra en:

**Administración → Comunidad virtual → Gestionar perfiles → Imágenes**

Desde el gestor de cada personaje puedes:

- revisar avatar, portada y galería;
- subir varias fotografías a la vez;
- asignar el tipo de cada imagen;
- añadir etiquetas temáticas;
- editar el texto alternativo;
- marcar una imagen como destacada;
- asignarla como avatar o portada;
- consultar el número de usos y el historial reciente;
- archivar/restaurar;
- retirar una imagen del pool.

## Actividad automática

La actividad virtual ya no rota las imágenes solo por orden. El motor V1.12.24 elige el recurso que mejor encaje con el texto y reduce las repeticiones recientes.

Por ejemplo, un post relacionado con cine puede priorizar una fotografía etiquetada `cine, series, casa`; uno relacionado con gastronomía puede priorizar `gastronomía, tapas, restaurantes`.

## Lucía V. — perfil piloto

Al desplegar sobre una comunidad virtual existente, si `@lucia.vidal.01` todavía utiliza el avatar SVG inicial, el arranque instala automáticamente su primer pack fotográfico consistente y actualiza avatar/portada.

Si el administrador ya había personalizado su avatar, el instalador no lo sobrescribe.

## Despliegue

1. Sustituir los archivos de V1.12.23 por los de V1.12.24.
2. Desplegar en Render.
3. Comprobar `/api/health`.
4. Entrar en Administración → Comunidad virtual.
5. Abrir Lucía V. → Imágenes.
6. Verificar las 6 imágenes del piloto.
7. Abrir el perfil de Lucía y confirmar avatar, portada y fotografías en actividad futura.

No hay nuevas variables de entorno y no requiere migración SQL manual.
