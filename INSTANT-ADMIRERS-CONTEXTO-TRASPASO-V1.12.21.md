# Instant Admirers — Contexto de traspaso V1.12.21

## Versión preparada
**V1.12.21 — Virtual Community**

Base utilizada: **V1.12.20 — Message Delete + Contrast Fix**, validada previamente por el usuario.

## Cambio principal
Sistema administrable de 100 anfitriones virtuales identificados (50 mujeres + 50 hombres), contenido programado y buzón de administración para responder a mensajes dirigidos a estos perfiles.

## Principio de transparencia
Los anfitriones son ficticios y se muestran con badge `Virtual` / `Perfil virtual`. No deben presentarse como personas reales. Se excluyen de métricas reales y del SEO público.

## Archivos técnicos principales
- `src/virtualCommunity.js`
- `src/schema.sql`
- `server.js`
- `public/app.js`
- `public/styles.css`
- `public/theme.css`
- `public/assets/virtual/`

## Base de datos
Nuevos elementos:
- `users.is_virtual`
- `virtual_profiles`
- `virtual_profile_media`
- `virtual_message_alerts`

## Panel Administración → Comunidad virtual
- Crear 100 perfiles una sola vez.
- Estado global.
- Actividad manual.
- Buzón de mensajes.
- Responder como anfitrión.
- Buscar anfitriones.
- Activar / pausar / retirar.
- Añadir imágenes al pool.
- Cambiar avatar mediante subida.

## Actividad automática
- Scheduler interno cada 30 minutos.
- 2–5 publicaciones/semana por anfitrión por defecto; ajustable desde Administración entre 1 y 7 (diaria).
- Horarios separados.
- Algunas publicaciones generan Stories.
- No hay likes/follows/comentarios automáticos entre anfitriones.

## Multimedia incluida
- 100 avatares SVG sintéticos.
- 100 portadas SVG.
- 400 escenas SVG para pools iniciales.
- Se pueden añadir fotos sintéticas desde Administración usando la infraestructura multimedia existente.

## Mensajes
Cuando un usuario real escribe a un perfil virtual:
- se guarda una alerta en `virtual_message_alerts`;
- Administración recibe un evento realtime;
- aparece badge de pendiente;
- el administrador puede abrir la conversación y responder como ese perfil virtual;
- la respuesta llega al usuario mediante Socket.IO.

## Métricas / SEO
Los perfiles virtuales no cuentan en:
- usuarios reales;
- launch dashboard;
- launch readiness;
- comunidad inicial real;
- admin de usuarios reales;
- perfiles públicos SEO;
- sitemap de perfiles.

Las tendencias de 7 días también excluyen actividad virtual.

## Estado de despliegue
Esta versión no debe considerarse desplegada/estable hasta que el usuario la suba a Render, compruebe `/api/health` y valide el funcionamiento en producción.
