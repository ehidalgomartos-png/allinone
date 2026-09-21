# Instant Admirers V1.2.7

## URLs públicas de perfil

Cada usuario dispone ahora de una URL directa y fácil de compartir:

```text
https://instantadmirers.com/nombredeusuario
```

### Comportamiento

- Si el visitante ya ha iniciado sesión, entra directamente al perfil.
- Si no ha iniciado sesión, ve acceso/registro y, al entrar, continúa automáticamente al perfil.
- Se respetan cuenta privada, bloqueos y retos de acceso.
- La invitación especial a un perfil utiliza también la URL limpia `/usuario`.
- Los enlaces antiguos `?profile=usuario` continúan funcionando y se convierten al formato nuevo.
- Desde el menú del perfil se puede compartir/copiar la URL pública.

## Compatibilidad

No hay migraciones de PostgreSQL. Se conserva toda la información de V1.2.4.

Consulta `ACTUALIZAR-A-V1.2.7.md`.


## V1.2.6
Rediseño responsive del panel de acceso especial por invitaciones.


## V1.2.7

Portada móvil más expresiva y premium sin alterar el escritorio ni la base de datos.
