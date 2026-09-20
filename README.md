# OmniSocial V0.2

MVP de red social + agregador + distribución multired, preparado para GitHub y Render con PostgreSQL persistente.

## Qué cambia respecto a V0.1

- PostgreSQL sustituye a `data/db.json`.
- Usuarios, posts, likes, comentarios, seguidores y cola multired son persistentes.
- Fotos y vídeos del MVP se almacenan en PostgreSQL para que no desaparezcan al reiniciar Render.
- `render.yaml` puede crear el Web Service y PostgreSQL automáticamente.
- Endpoint de salud: `/api/health`.
- Las conexiones Instagram/Facebook/TikTok/YouTube/X siguen simuladas: OAuth real será una fase posterior.

## Despliegue recomendado

Lee `DEPLOY-RENDER.md`.

## Ejecutar en local

Necesitas Node.js 20+ y PostgreSQL.

1. Copia `.env.example` como `.env`.
2. Cambia `DATABASE_URL` por la URL de tu PostgreSQL local o remoto.
3. Cambia `JWT_SECRET`.
4. Ejecuta:

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

Las tablas se crean automáticamente al arrancar la aplicación.

## Límites del MVP

Los archivos se limitan a 10 MB y se almacenan en PostgreSQL. Esto es cómodo para pruebas y primera fase, pero no es la arquitectura final para una red social con mucho vídeo. Cuando avancemos, moveremos multimedia a almacenamiento de objetos (S3/Cloudinary/R2 o equivalente) y mantendremos en PostgreSQL solo metadatos y URLs.
