# Instant Admirers V1.4 — Rendimiento

V1.4 prepara Instant Admirers para crecer sin cargar todo el contenido de una sola vez.

Arquitectura:

- Render / Node.js: API, seguridad, tiempo real y lógica.
- PostgreSQL: usuarios, posts, relaciones y metadatos con índices optimizados.
- Cloudinary/CDN: imágenes y vídeos.
- Resend: correo transaccional.

Flujo del feed V1.4:

```text
Usuario abre Inicio
       ↓
API devuelve 15 posts
       ↓
se renderizan solo esos posts
       ↓
usuario se acerca al final
       ↓
se solicitan 15 más
       ↓
scroll infinito
```

Los vídeos no se precargan todos a la vez y las imágenes de Cloudinary pueden viajar directamente del CDN al navegador.

Consulta `ACTUALIZAR-A-V1.4.md` antes de desplegar.
