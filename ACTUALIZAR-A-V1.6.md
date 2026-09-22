# Actualizar Instant Admirers V1.5.0 → V1.6.0

## 1. Sustituir archivos
Descomprime el ZIP y sustituye el contenido del repositorio actual. No borres PostgreSQL, Cloudinary ni las variables de Render.

## 2. Despliegue
Haz commit en `main`. Render desplegará automáticamente. El arranque crea las tablas `launch_settings` y `app_events`; no hay migración manual.

## 3. Comprobación
Abre `https://instantadmirers.com/api/health`. Debe indicar `"version":"1.6.0"`.

## 4. Panel de lanzamiento
Entra como administrador → **Administración**. Verás **Lanzamiento controlado** con actividad, altas, primeros posts, referidos y errores técnicos.

El modo de registro puede ser:
- **Abierto**: cualquiera puede registrarse.
- **Solo invitación**: el alta exige un enlace con código de invitación válido.
- **Pausado**: no se crean cuentas nuevas; las existentes siguen entrando.

La actualización deja el modo en **Abierto** para no bloquear registros por sorpresa.

## 5. Activación de usuarios
Los usuarios nuevos/incompletos verán en Inicio un checklist: foto, perfil, primera publicación y seguir a alguien.

## 6. Observabilidad
V1.6 registra de forma interna sesiones activas y errores técnicos para el panel de administración. No se necesita ningún servicio externo de analítica.
