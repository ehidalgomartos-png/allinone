# Actualizar OmniSocial V1.0.1 → V1.1

1. **No borres** el servicio de Render ni `omnisocial-db`.
2. Descomprime `OmniSocial-V1.1-Calidad.zip`.
3. Sube el contenido al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main`.
5. Espera al Auto-Deploy de Render.
6. Abre `/api/health` y confirma `"version":"1.1.0"`.

## Qué conserva

Usuarios, publicaciones, fotos, portadas, Stories, Reels, mensajes, amigos, seguidores, privacidad, denuncias y administración permanecen intactos.

## Pruebas recomendadas

- Dar like sin que el feed salte al principio.
- Guardar/desguardar una publicación.
- Enviar dos veces muy rápido un comentario o mensaje: debe salir una sola vez.
- Desactivar Wi‑Fi unos segundos para ver el aviso de conexión.
- Pulsar Escape dentro de un modal o Story.
- Probar móvil y ordenador.
