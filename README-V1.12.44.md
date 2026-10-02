# Instant Admirers V1.12.44 — Salud y mantenimiento de la comunidad virtual

Parte de V1.12.43 estable. Añade un centro operativo de solo lectura para los 100 anfitriones virtuales.

## Incluye
- Diagnóstico global de scheduler de posts e interacciones.
- Detección de fechas ausentes, atrasos de 6/24 h y programaciones anómalamente lejanas.
- Detección de perfiles sin actividad automática durante 14 días y actividad excesiva en 24 h.
- Vigilancia de mensajes pendientes con avisos >24 h y críticos >72 h.
- Registro de errores reales del scheduler de actividad/interacción en `app_events`.
- Balance informativo de actividad por sexo y ciudad.
- Escaneo manual y automático cada 24 h, histórico y deltas de incidencias nuevas/resueltas.
- Banner administrativo solo cuando exista una incidencia operativa real.
- Acciones manuales para reprogramar posts/interacciones; el centro nunca publica ni interactúa por sí mismo.

## Seguridad
El escáner es de solo lectura. No cambia perfiles, no publica, no interactúa, no responde mensajes y no toca la biblioteca visual.

## Verificación
`/api/health` debe devolver `version: "1.12.44"` y las features `virtual-community-health-center`, `virtual-community-health-daily-watch`, `virtual-community-health-history`, `virtual-community-health-schedule-scan`, `virtual-community-health-inbox-watch`, `virtual-community-health-balance` y `virtual-community-health-runtime-errors`.
