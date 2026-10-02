# Instant Admirers V1.12.42.1 — Quality Repair Hotfix

Parte de V1.12.42 y corrige los dos problemas detectados por el primer diagnóstico real del Centro de Calidad: reactivación del pack base después de cada arranque y el antiguo fallback que sustituía determinadas portadas por el avatar.

## Reparación segura

Administración → Comunidad virtual → Centro de Calidad → **Reparar calidad** muestra un preview sin modificar datos. Usa la última importación masiva completa confirmada como fuente de verdad.

Al confirmar:
- restaura las portadas del lote V4 REAL;
- archiva las imágenes base legacy que quedaron activas junto al lote actual;
- calcula SHA-256 para recursos locales sin huella cuando el archivo fuente sigue disponible;
- no borra archivos, posts ni Stories;
- guarda snapshot y permite deshacer la reparación visual.

Además, el sync automático de packs base deja de reactivar imágenes legacy en perfiles con importación masiva confirmada y el workaround de portadas V1.12.30 ya no pisa perfiles importados.

No requiere SQL manual ni variables nuevas.
