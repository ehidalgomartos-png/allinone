# Instant Admirers V1.12.26 — Formato de packs realistas

## ZIP por lote

Cada ZIP puede contener **1–10 perfiles** y hasta **100 MB** comprimidos. Cada perfil debe tener exactamente **6 imágenes**:

- 1 `avatar`
- 1 `cover`
- 4 `post`

Formatos de imagen: JPG/JPEG, PNG o WEBP. Máximo 10 MB por imagen.

## Estructura recomendada

```text
manifest.json
profiles/
  sofia.gimenez.02/
    avatar.jpg
    cover.jpg
    post-01.jpg
    post-02.jpg
    post-03.jpg
    post-04.jpg
  paula.lozano.03/
    avatar.jpg
    cover.jpg
    post-01.jpg
    post-02.jpg
    post-03.jpg
    post-04.jpg
```

`manifest.json` usa el esquema `instant-admirers.virtual-pack/v1`. Hay un ejemplo disponible en `/virtual-pack-import-template.json`.

## Comportamiento del importador

1. Valida el ZIP completo antes de iniciar la importación.
2. Solo permite `username` de perfiles existentes con `is_virtual=true`.
3. Verifica que cada perfil tenga 6 imágenes y la combinación correcta de tipos.
4. Comprueba que el contenido real de cada archivo coincide con JPG, PNG o WEBP.
5. Sube las fotografías al proveedor de imágenes configurado (Bunny Storage cuando está disponible).
6. Archiva el pack base sintético del perfil y packs realistas anteriores que hayan sido reemplazados; no borra referencias históricas.
7. Asigna automáticamente el nuevo avatar y la nueva portada.
8. Registra etiquetas, ALT, imagen destacada y orden.
9. Usa SHA-256 para reutilizar una fotografía si se vuelve a importar exactamente el mismo archivo.
10. Registra un historial administrativo del lote importado.

Los perfiles siguen mostrando la divulgación **Perfil virtual / Anfitrión virtual**.
