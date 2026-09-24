# Instant Admirers V1.12.8 — Growth Engine Profile Preview

## Añadido
- Vista previa visual del perfil destino en autenticación cuando la visita procede de una campaña Growth Engine válida.
- Foto de cabecera y avatar del perfil invitante.
- Nombre, @usuario, frase de perfil y biografía antes del formulario.
- Mensaje de acceso de campaña/perfil integrado dentro de la vista previa cuando existe acceso exclusivo.
- La vista previa se conserva al alternar entre Entrar y Crear cuenta.
- Diseño responsive compacto para móvil.
- Selector ES / EN movido a la cabecera superior, junto al logotipo, para eliminar espacio vertical innecesario antes del perfil/formulario.
- Nuevas capacidades declaradas en `/api/health`: `growth-profile-preview` y `growth-auth-profile-preview`.

## Seguridad
- El endpoint público solo devuelve `profile_preview` si la campaña está activa y pertenece exactamente al perfil destino.
- Los enlaces directos sin campaña conservan la respuesta pública mínima anterior.
- No se modifica la protección de posts, Stories, Reels, mensajes ni contenido exclusivo.

## Compatibilidad
- No requiere cambios de esquema PostgreSQL.
- No requiere nuevas variables de entorno.
- Se conserva completa la infraestructura Bunny Media de V1.12.6 y el SEO de V1.12.5.

## Ajuste legal en autenticación
- Se añade un aviso legal compacto y permanente en las pantallas **Entrar** y **Crear cuenta**.
- Informa de que iniciar sesión, crear una cuenta o usar Instant Admirers implica aceptar los **Términos de Uso** y la **Política de Privacidad**, y confirmar una edad mínima de 18 años.
- Los enlaces legales son clicables y respetan ES/EN.
- El registro conserva además su casilla de aceptación explícita de 18+, términos, privacidad y normas de la comunidad.


### Ajuste legal de autenticación
- El aviso de aceptación de Términos, Privacidad y mayoría de edad se muestra únicamente en **Entrar**.
- En **Crear cuenta** se mantiene solo el checkbox legal obligatorio, evitando duplicar el mismo mensaje.
- El texto del aviso de Entrar se ha ajustado a «Al iniciar sesión y usar Instant Admirers…» (y equivalente en inglés).
