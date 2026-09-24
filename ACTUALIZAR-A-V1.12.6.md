# Actualizar a V1.12.6 — Bunny Media

1. Haz copia de la versión desplegada y de PostgreSQL.
2. Configura las variables Bunny en **Render → Environment** antes de probar subidas nuevas.
3. Sustituye el proyecto por este ZIP y despliega.
4. No borres PostgreSQL ni elimines en masa los archivos de Cloudinary.
5. Comprueba `https://instantadmirers.com/api/health` y verifica `"version":"1.12.6"`.
6. Sube primero una imagen de prueba y confirma que `/api/health` indica `images: "bunny_storage"`.
7. Sube después un vídeo corto. Durante el procesado puede verse `Procesando vídeo…`; cuando Bunny termine debe reproducirse mediante HLS.
8. Prueba un perfil bloqueado desde otra cuenta: el contenido debe seguir sin ser accesible hasta desbloquearlo.
9. Prueba móvil/iPhone y escritorio antes de abrir tráfico real.

Lee `BUNNY-CONFIGURACION-V1.12.6.md` para los nombres exactos de las variables y los ajustes de Bunny.
