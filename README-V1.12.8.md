# Instant Admirers V1.12.8 — Growth Engine Profile Preview

Versión preparada sobre la base estable V1.12.6 Bunny Media.

## Novedad principal
Cuando una persona llega mediante un enlace válido de **Growth Engine** dirigido a un perfil, las pantallas **Entrar** y **Crear cuenta** muestran una vista previa visual del perfil invitante antes del formulario:

- foto de cabecera;
- foto de perfil;
- nombre;
- @usuario;
- frase de perfil;
- biografía;
- mensaje de acceso de la campaña/perfil cuando el perfil es exclusivo;
- confirmación de invitación detectada.

La vista previa permanece visible al cambiar entre **Entrar** y **Crear cuenta** y se mantiene el retorno al perfil de destino tras autenticarse o registrarse.

## Seguridad y privacidad
La vista previa ampliada solo se entrega cuando el parámetro `campaign` corresponde a una campaña Growth Engine **activa** cuyo perfil destino coincide con la URL. Un acceso directo normal a `/usuario` conserva el comportamiento anterior y no recibe la biografía/cabecera ampliada a través del endpoint público.

## Compatibilidad
- Sin migración de base de datos.
- Sin variables de entorno nuevas.
- Mantiene Bunny Storage, Bunny Stream, Cloudinary legacy, SEO 40 landings y Growth Engine Attribution.
- Mantiene el mensaje personalizado por campaña de V1.12.4.

## Deploy
Despliega en el mismo servicio Render. Después comprueba:

```text
https://instantadmirers.com/api/health
```

Debe devolver `version: 1.12.8` y conservar `images: bunny_storage` / `videos: bunny_stream`.

Prueba después un enlace creado desde Growth Engine en una ventana privada para verificar la experiencia de visitante nuevo.
