# Actualizar Instant Admirers V1.1.1 → V1.1.2

1. **No borres** el servicio de Render ni la base de datos PostgreSQL.
2. Descomprime `Instant-Admirers-V1.1.2-Legal.zip`.
3. Sube el contenido al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main`.
5. Espera al Auto-Deploy de Render.
6. Abre `/api/health` y confirma `"version":"1.1.2"`.

## Qué añade

- Aviso Legal: `/legal/`
- Política de Privacidad: `/privacy/`
- Política de Cookies: `/cookies/`
- Términos de Uso: `/terms/`
- Normas de la Comunidad: `/community-guidelines/`
- Enlaces legales en login, barra lateral y Ajustes.
- Registro limitado a mayores de 18 años.
- Aceptación obligatoria de Términos y Normas al crear una cuenta.
- Los usuarios existentes reciben una pantalla de aceptación al volver a entrar.
- Se registra la fecha y versión aceptada en PostgreSQL.

## Qué conserva

Usuarios, publicaciones, fotos, portadas, Stories, Reels, mensajes, amigos, seguidores, privacidad, denuncias, administración y todos los datos existentes permanecen intactos.

## Comprobaciones

- `/api/health` devuelve `1.1.2`.
- Abre las cinco rutas legales.
- Crea una cuenta nueva: no debe permitir registro sin confirmar 18+ y aceptar términos.
- En una cuenta antigua debe aparecer la pantalla de actualización legal una sola vez.

## Importante

Lee `LEGAL-PENDIENTE.md`: falta confirmar, si procede, la información de inscripción en Registro Mercantil y la denominación legal exacta del titular.
