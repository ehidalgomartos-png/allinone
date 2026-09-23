# Instant Admirers V1.12.3 — Mensaje de acceso a perfiles exclusivos

## Novedades
- Los perfiles con acceso especial pueden escribir un mensaje personal de hasta 220 caracteres.
- El mensaje se configura desde **Perfil → Condición → Acceso a mi perfil**.
- El mensaje aparece en el perfil bloqueado, antes de la barra de progreso.
- El mensaje aparece también antes de iniciar sesión o crear una cuenta cuando alguien entra directamente a ese perfil.
- La pantalla de acceso directo se simplifica: se elimina la tarjeta duplicada “Te han invitado al perfil…”.
- Cuando hay una invitación válida, el mismo bloque muestra `✓ Invitación detectada`.
- Si el propietario no escribe mensaje, se usa un texto automático ES/EN.
- Los mensajes escritos por usuarios no se traducen automáticamente.

## Base técnica
- Nueva columna PostgreSQL `users.friend_gate_message` (migración automática e idempotente).
- `/api/public/profile/:username` expone únicamente el estado de acceso especial y su mensaje público cuando corresponde.
- `/api/friend-gate` permite leer y guardar el mensaje.
- El límite se valida en backend y frontend: 220 caracteres.
- Se conservan todas las protecciones multimedia de V1.12.2.
