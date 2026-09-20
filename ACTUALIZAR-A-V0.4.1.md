# Actualizar OmniSocial a V0.4.1

Esta revisión corrige la portada responsive. En móvil se muestra el mismo contenido que en ordenador, apilado en una sola columna.

## Actualización rápida

Puedes subir todo el ZIP al mismo repositorio, o si ya tienes V0.4 funcionando sustituir solo:

- `public/styles.css`
- `package.json`
- `server.js`

No borres PostgreSQL ni cambies `DATABASE_URL`. Render desplegará automáticamente tras el commit.

Comprueba `/api/health`: debe devolver `version: "0.4.1"`.
