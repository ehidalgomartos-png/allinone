# Instant Admirers V1.12.45 — Motor de actividad virtual 3.0

Parte de V1.12.44 estable. Evoluciona la actividad automática de los 100 anfitriones virtuales para que el ritmo, los textos, los formatos y los horarios resulten menos uniformes a largo plazo.

## Incluye
- Anti-repetición global: evita reutilizar exactamente el mismo texto entre perfiles durante los últimos 10 días.
- Anti-repetición individual ampliada con hasta 24 publicaciones recientes por perfil.
- Ritmos personales deterministas: pausado, equilibrado, social, explorador y fin de semana.
- Preferencias horarias por perfil con franjas de mañana, tarde y noche, sin actividad automática de madrugada.
- Pausas naturales y límite anti-ráfagas para evitar perfiles excesivamente activos.
- Mezcla adaptativa de Post texto, Post foto, Post + Story y Story independiente según el historial reciente.
- Temas contextuales: ciudad, intereses, conversación, descubrimiento, ritmo tranquilo y preguntas.
- Más variaciones de copy y Stories, manteniendo ciudad/intereses del perfil como contexto.
- Metadatos auditables en `virtual_activity_log`: motor, ritmo, tema, franja, formato y repeticiones evitadas.
- Panel `⚙ Motor actividad 3.0` con eventos, perfiles activos, textos únicos, repetición exacta, formatos, ritmos, temas y franjas.
- Integración con `❤ Salud comunidad`: detecta repeticiones exactas creadas por el motor 3.0 y las convierte en incidencia operativa.
- Reprogramación V3 distribuida según la cadencia de cada perfil en vez de concentrar a todos en las mismas 72 horas.

## Seguridad
- No cambia la identificación de los perfiles virtuales.
- No automatiza mensajes privados.
- No modifica fotos ni importaciones V4.
- El botón manual `Generar actividad ahora` sigue siendo explícito; el scheduler normal respeta pausas, límites y horario.

## Verificación
`/api/health` debe devolver `version: "1.12.45"` y las features:
- `virtual-activity-3`
- `virtual-activity-global-anti-repeat`
- `virtual-activity-natural-rhythm`
- `virtual-activity-daypart-preferences`
- `virtual-activity-format-balancing`
- `virtual-activity-contextual-themes`
- `virtual-activity-engine-diagnostics`

En Administración → Comunidad virtual aparece `⚙ Motor actividad 3.0`.
