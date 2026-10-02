# Guía del ZIP masivo — V1.12.40

> **V1.12.40.1:** corregida la resolución de carpetas por username. Se admiten indistintamente carpetas `001`–`100` o el username exacto (`lucia.vidal.01`, etc.).
El objetivo es subir **un único ZIP** con las fotos de los **100 perfiles virtuales**.

## Estructura recomendada

```text
fotos-virtuales.zip
├── 001/
│   ├── avatar.jpg
│   ├── cover.jpg
│   ├── foto-01.jpg
│   ├── foto-02.jpg
│   └── ...
├── 002/
│   ├── avatar.jpg
│   ├── cover.jpg
│   └── ...
...
└── 100/
    ├── avatar.jpg
    ├── cover.jpg
    └── ...
```

También puedes usar el `username` exacto como nombre de carpeta:

```text
lucia.vidal.01/avatar.jpg
lucia.vidal.01/cover.jpg
lucia.vidal.01/foto-01.jpg
```

Puede existir una carpeta contenedora exterior; el importador busca `001`–`100` o el username entre los segmentos de la ruta.

## Reglas

- Deben estar representados los 100 perfiles.
- Entre 3 y 30 imágenes por perfil.
- Máximo 2.000 imágenes en total.
- Formatos: JPG, JPEG, PNG o WEBP.
- Máximo 15 MB por imagen.
- No se admiten duplicados binarios dentro del mismo perfil; si la misma foto aparece en dos perfiles distintos se muestra como aviso, no como error.
- Nombra preferiblemente una imagen `avatar` y otra `cover` o `portada`.
- Si no hay nombres de avatar/portada, el sistema asigna la primera imagen por orden natural como avatar y la segunda como portada; aparecerá un aviso en el preview.
- El resto se asigna automáticamente como fotos de publicación.
- No hace falta `manifest.json`.

## Flujo de seguridad

1. El ZIP se sube a temporal.
2. Se valida íntegramente y se comprueba que las 100 asignaciones sean correctas.
3. Las imágenes nuevas se suben a staging, sin tocar las actuales.
4. Aparece el preview de los 100 perfiles.
5. Solo al pulsar **Confirmar** se aplica el reemplazo.
6. Antes del cambio se crea un snapshot completo.
7. Las imágenes antiguas se retiran del pool activo y se conservan archivadas para rollback.
8. Desde Historial puedes restaurar el snapshot si detectas un problema. Los rollbacks respetan el orden de importación: no se permite que un lote antiguo pise uno posterior todavía aplicado.
