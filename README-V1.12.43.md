# Instant Admirers V1.12.43 — Vigilancia automática de calidad visual

Base: **V1.12.42.1 estable**.

## Qué añade
- Escaneo automático de calidad visual cada 24 horas.
- Primer ciclo automático tras el arranque y comprobación horaria de vencimiento.
- Histórico de resultados con resumen, incidencias nuevas y resueltas.
- Comparación por perfil/código de incidencia para detectar deltas reales.
- Aviso en Administración únicamente cuando hay perfiles en warning/critical.
- Ejecución manual desde `🛡 Vigilancia visual`.
- Limpieza manual de histórico >90 días y retención automática de 180 días.
- Aviso en tiempo real a administradores cuando un escaneo detecta incidencias nuevas.
- El sistema es **solo lectura**: nunca repara, archiva, sustituye ni borra fotografías automáticamente.

## Base de datos
La tabla `virtual_quality_scans` se crea automáticamente al arrancar mediante `src/schema.sql`. No requiere SQL manual.

## API
- `GET /api/admin/virtual-community/quality-watch`
- `POST /api/admin/virtual-community/quality-watch/run`
- `POST /api/admin/virtual-community/quality-watch/cleanup`

## Salud
`/api/health` debe devolver `version: "1.12.43"` y las features `virtual-quality-daily-watch`, `virtual-quality-watch-history`, `virtual-quality-watch-delta-alerts` y `virtual-quality-watch-admin-banner`.
