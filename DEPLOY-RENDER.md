# Instant Admirers V1.2 en Render

## Actualización normal

1. Sube el contenido de V1.2 al repositorio GitHub actual.
2. Render hará Auto-Deploy con `npm install` y `npm start`.
3. No borres `omnisocial-db`.
4. Comprueba `https://instantadmirers.com/api/health`.

La respuesta debe incluir:

```json
{
  "ok": true,
  "version": "1.2.0",
  "database": "postgresql",
  "email": {
    "configured": false,
    "verification_required": false
  }
}
```

`email.configured:false` es normal hasta que añadas SMTP.

## Configurar correo saliente

En Render → `omnisocial` → Environment añade:

```text
APP_URL=https://instantadmirers.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASS=contraseña-de-aplicación
EMAIL_FROM=Instant Admirers <tu-cuenta@gmail.com>
REQUIRE_EMAIL_VERIFICATION=false
```

Guarda y espera al redeploy. Después `/api/health` debe mostrar `email.configured:true`.

Prueba primero:

- “¿Has olvidado tu contraseña?”
- Ajustes → Email → Verificar
- Ajustes → Email → Cambiar email

Cuando los correos lleguen correctamente y hayas verificado las cuentas de prueba, puedes activar:

```text
REQUIRE_EMAIL_VERIFICATION=true
```

No lo actives antes de configurar SMTP.
