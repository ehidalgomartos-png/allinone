# Actualizar OmniSocial V0.9 → V1.0

No borres tu servicio de Render ni tu base PostgreSQL.

## 1. Sustituye los archivos del repositorio

Descomprime el ZIP de V1.0 y sube su contenido al mismo repositorio GitHub que ya usa Render.

Los archivos principales que cambian son:

```text
server.js
package.json
src/schema.sql
public/app.js
public/styles.css
README.md
```

Haz commit en la misma rama que despliega Render.

## 2. Espera al Auto Deploy

La base se migra automáticamente al arrancar. No borra usuarios ni publicaciones existentes.

V1.0 añade:

- `users.role`
- `users.account_status`
- `users.onboarding_completed`
- datos de revisión en `reports`
- tabla `moderation_actions`

Los usuarios existentes se consideran ya incorporados (`onboarding_completed = true`). Los nuevos usuarios verán el onboarding.

## 3. Activa tu cuenta de administrador

En Render abre:

**omnisocial → Environment → Add Environment Variable**

Añade:

```text
ADMIN_EMAILS=EL_EMAIL_DE_TU_CUENTA
```

Si quieres más de un administrador:

```text
ADMIN_EMAILS=uno@email.com,dos@email.com
```

Guarda los cambios y deja que Render reinicie el servicio. Cierra sesión y vuelve a entrar en OmniSocial.

## 4. Comprueba V1.0

Abre:

```text
https://omnisocial-rwn6.onrender.com/api/health
```

Debe incluir:

```json
{
  "ok": true,
  "version": "1.0.0"
}
```

## 5. Pruebas recomendadas

- Crear una cuenta nueva y comprobar el onboarding.
- Cambiar contraseña.
- Denunciar un post con una segunda cuenta.
- Entrar como administrador y abrir Administración.
- Poner la denuncia En revisión / Cerrada.
- Probar eliminar el post denunciado.
- Suspender y reactivar una cuenta de prueba.
- Verificar que una cuenta suspendida ya no puede iniciar sesión ni usar una sesión existente.

## Eliminación de cuenta

Perfil → Ajustes → Eliminar cuenta. Requiere la contraseña y escribir `ELIMINAR`.
