# Instant Admirers V1.1.2 — Legal + 18+

Actualización sobre V1.1.1 que cierra la primera capa legal visible de `instantadmirers.com` sin cambiar la arquitectura de Render/PostgreSQL.

## Identidad legal configurada

- Titular: Hidalgo Entertaiment
- CIF: B45656595
- Domicilio: Calle Ancha, 6, Sevilla, España
- Email: vrmatch.es@gmail.com
- Edad mínima: 18 años

## Páginas públicas

- `https://instantadmirers.com/legal/`
- `https://instantadmirers.com/privacy/`
- `https://instantadmirers.com/cookies/`
- `https://instantadmirers.com/terms/`
- `https://instantadmirers.com/community-guidelines/`

## Registro y aceptación

Las cuentas nuevas deben confirmar que tienen 18 años o más y aceptar los Términos de Uso y las Normas de la Comunidad. La aplicación registra:

- `age_confirmed_at`
- `terms_accepted_at`
- `terms_version`

Los usuarios creados antes de V1.1.2 reciben una pantalla de aceptación legal al volver a usar la aplicación.

## Cookies / almacenamiento

Actualmente no se integra publicidad, Google Analytics ni Meta Pixel. La app utiliza `localStorage` para el token de sesión y la preferencia del feed. Por ello no se incorpora un banner de cookies no necesarias en esta versión.

## Actualización

Consulta `ACTUALIZAR-A-V1.1.2.md`.

## Pendiente antes de apertura pública

Consulta `LEGAL-PENDIENTE.md` y completa los datos de inscripción registral si son aplicables.
