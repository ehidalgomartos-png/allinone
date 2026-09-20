# Conectar instantadmirers.com a Render

El servicio actual puede seguir llamándose `omnisocial` internamente. No cambies el nombre del servicio ni de la base de datos: el rebranding es solo de cara al usuario.

## 1. Añadir el dominio en Render

En Render:

1. Abre el Web Service `omnisocial`.
2. Ve a **Settings → Custom Domains**.
3. Pulsa **Add Custom Domain**.
4. Añade `instantadmirers.com`.
5. Render añadirá también la variante `www` y podrá redirigir una a la otra.

## 2. DNS en DonDominio

En DonDominio entra en:

**Dominios → instantadmirers.com → Zona DNS**

Configura:

### Dominio raíz

- Tipo: `A`
- Host/Nombre: `@` (o vacío, según la interfaz)
- Destino: `216.24.57.1`

### www

- Tipo: `CNAME`
- Host/Nombre: `www`
- Destino: `omnisocial-rwn6.onrender.com`

Elimina o modifica cualquier registro `A`, `ANAME`, `CNAME`, redirección o parking que entre en conflicto con `@` o `www`.

Render recomienda retirar registros `AAAA` durante la configuración porque su servicio web usa IPv4 para este flujo.

## 3. Verificar en Render

Vuelve a **Settings → Custom Domains** y pulsa **Verify**.

Cuando el DNS haya propagado, Render emitirá automáticamente el certificado TLS/SSL y el dominio funcionará con `https://`.

## 4. Comprobaciones

- `https://instantadmirers.com`
- `https://www.instantadmirers.com`
- `https://instantadmirers.com/api/health`

La respuesta de health debe mostrar `"version":"1.1.1"`.

## 5. Después de verificar

Puedes mantener temporalmente `https://omnisocial-rwn6.onrender.com` como respaldo. Cuando todo esté estable, Render permite desactivar el subdominio `onrender.com`.

## Fuentes técnicas

- Render Custom Domains: https://render.com/docs/custom-domains
- Render DNS providers: https://render.com/docs/configure-other-dns
- DonDominio Zona DNS: https://www.dondominio.com/es/help/238/apuntar-dominio-ip-servidor/
