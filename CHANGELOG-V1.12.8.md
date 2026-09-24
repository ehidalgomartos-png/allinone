# Instant Admirers V1.12.8 — Growth Engine Profile Preview

## Añadido
- Vista previa visual del perfil destino en autenticación cuando la visita procede de una campaña Growth Engine válida.
- Foto de cabecera y avatar del perfil invitante.
- Nombre, @usuario, frase de perfil y biografía antes del formulario.
- Mensaje de acceso de campaña/perfil integrado dentro de la vista previa cuando existe acceso exclusivo.
- La vista previa se conserva al alternar entre Entrar y Crear cuenta.
- Diseño responsive compacto para móvil.
- Nuevas capacidades declaradas en `/api/health`: `growth-profile-preview` y `growth-auth-profile-preview`.

## Seguridad
- El endpoint público solo devuelve `profile_preview` si la campaña está activa y pertenece exactamente al perfil destino.
- Los enlaces directos sin campaña conservan la respuesta pública mínima anterior.
- No se modifica la protección de posts, Stories, Reels, mensajes ni contenido exclusivo.

## Compatibilidad
- No requiere cambios de esquema PostgreSQL.
- No requiere nuevas variables de entorno.
- Se conserva completa la infraestructura Bunny Media de V1.12.6 y el SEO de V1.12.5.
