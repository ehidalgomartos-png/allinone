# Actualizar V1.1 → Instant Admirers V1.1.1

1. No borres el servicio de Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.1.1-Rebranding.zip`.
3. Sube todo al mismo repositorio GitHub `allinone` sustituyendo los archivos actuales.
4. Haz commit en `main`.
5. Espera al Auto-Deploy de Render.
6. Comprueba `/api/health` y confirma `"version":"1.1.1"`.
7. Entra en la app y comprueba logo, favicon y nombre nuevo.
8. Después sigue `DOMINIO-INSTANTADMIRERS.md`.

## Se conserva

Usuarios, contraseñas, perfiles, publicaciones, Stories, Reels, amigos, seguidores, mensajes, privacidad, denuncias, moderación y configuración existente.

## No hagas esto

- No crees otro Blueprint.
- No crees otra base de datos.
- No renombres por ahora el servicio `omnisocial` de Render.
