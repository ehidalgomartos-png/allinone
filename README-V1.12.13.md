# Instant Admirers V1.12.13 — Chat Gate Fix

Base: V1.12.12.

## Cambios principales

- El reto de acceso también protege el chat privado.
- Un usuario que no haya completado el reto de un perfil no puede iniciar ni enviar mensajes, fotos o vídeos a ese perfil.
- Las conversaciones antiguas siguen visibles, pero quedan en modo lectura para el fan hasta completar el reto.
- El chat muestra un aviso claro con botón para volver al perfil y completar el reto.
- Se corrige la conversación unidireccional: si una persona ya te escribió, puedes responder aunque su política de mensajes sea más restrictiva, siempre que no exista bloqueo ni un reto pendiente hacia el destinatario.
- Los vídeos de Bunny Stream que están procesándose dentro del chat se refrescan cada 5 segundos hasta estar disponibles; después el refresco vuelve al ritmo normal.
- Los mensajes con vídeo en procesamiento siguen permitiendo responder normalmente cuando el chat está autorizado.

## Sin cambios de infraestructura

No requiere nuevas variables de Render ni migraciones manuales de PostgreSQL.
Bunny, SEO, Growth Engine y el resto de funciones de V1.12.12 se mantienen.
