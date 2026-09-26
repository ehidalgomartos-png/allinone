# Actualizar V1.12.15 → V1.12.16

1. Sustituye en GitHub el contenido actual por este ZIP.
2. Haz commit en `main` y espera el Auto Deploy de Render.
3. No cambies PostgreSQL, Bunny, Resend ni variables de entorno.
4. El arranque añade automáticamente los dos campos nuevos; no ejecutes SQL manual.
5. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.12.16"`.
6. Entra en el perfil que quieras hacer visible → **Privacidad** → activa **Vista previa pública de mi perfil** → Guarda.
7. Abre en incógnito `https://instantadmirers.com/USUARIO`.
8. Comprueba que se ven cabecera/bio/textos y que fotos/vídeos están bloqueados.
9. Pulsa Crear cuenta y verifica que el registro vuelve al perfil.

Si el perfil está marcado como **Cuenta privada**, la vista teaser directa no se publica.
