# Instant Admirers — Contexto de traspaso V1.12.26

## Base

- Producción confirmada antes de esta entrega: V1.12.25 — Virtual Profile Packs.
- Candidata preparada: V1.12.26 — Realistic Pack Importer.
- No considerar V1.12.26 desplegada hasta que `/api/health` lo confirme en Render.

## Objetivo de V1.12.26

Permitir sustituir progresivamente los packs sintéticos base de los 99 anfitriones restantes por packs fotográficos sintéticos realistas, sin crear una nueva versión de la aplicación por cada tanda.

## Flujo futuro

1. Generar 1–10 personajes por tanda, manteniendo identidad visual consistente dentro de sus 6 fotografías.
2. Empaquetar avatar, portada y 4 posts en un ZIP con `manifest.json`.
3. Importar el ZIP desde Administración.
4. Revisar perfiles y continuar con la siguiente tanda.

## Reglas del importador

- Máximo 10 perfiles / 100 MB por ZIP.
- Exactamente 6 imágenes por perfil: avatar, cover, 4 posts.
- JPG/JPEG, PNG o WEBP; máximo 10 MB por imagen.
- Solo perfiles virtuales existentes.
- El pack base sustituido queda archivado, no borrado.
- Reimportar el mismo archivo reutiliza media mediante SHA-256.
- Los perfiles mantienen siempre la divulgación de perfil/anfitrión virtual.
