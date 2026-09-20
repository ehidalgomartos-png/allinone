# Actualizar Instant Admirers V1.1.2 → V1.1.3

1. **No borres** Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.1.3-UX-Movil.zip`.
3. Sube el contenido al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main`.
5. Espera al Auto-Deploy de Render.
6. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.1.3"`.

## Cambios
- El icono de foto/vídeo del Inicio ya no abre directamente el selector del sistema. Abre primero `Crear publicación` y resalta `Foto / vídeo`.
- En móvil, tu perfil muestra solo `Editar perfil` y `•••` en vez de cinco botones grandes.
- El menú `•••` contiene Amigos, Privacidad, Ajustes, Administración (si eres admin) y `Cerrar sesión`.
- `Ajustes de cuenta` también incorpora `Cerrar sesión`.

No hay migraciones de base de datos ni pérdida de datos.
