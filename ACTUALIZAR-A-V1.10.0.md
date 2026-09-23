# Actualizar Instant Admirers a V1.10.0

V1.10.0 parte exclusivamente de V1.9.4.

1. Sustituye el proyecto desplegado por el contenido completo de este ZIP.
2. Mantén las variables de entorno actuales de Render (`DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, Resend, etc.).
3. Despliega normalmente. Al iniciar, `src/schema.sql` crea automáticamente las nuevas tablas de publicidad sin borrar datos existentes.
4. Comprueba `/api/health`: debe mostrar `"version":"1.10.0"`.
5. Entra como administrador y abre **Administración → Publicidad**.
6. El sistema publicitario nace **apagado**. Crea y revisa tus campañas y, cuando quieras mostrarlas, activa el interruptor general.

## Prueba recomendada

- Crea un banner de imagen con ubicación **En perfiles**.
- En segmentación selecciona **Solo perfiles seleccionados** y añade un perfil concreto.
- Activa la campaña y después el sistema general.
- Visita el perfil elegido: el banner debe aparecer bajo la cabecera.
- Visita otro perfil: no debe aparecer ningún hueco.

## Nota de Cloudinary

La subida desde ordenador necesita `CLOUDINARY_URL`. Si no está configurado, todavía puedes crear banners mediante una URL de imagen externa.
