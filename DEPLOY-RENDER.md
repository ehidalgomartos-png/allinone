# Desplegar OmniSocial V0.2 en GitHub + Render

## Opción A — Blueprint de Render (la más sencilla)

### 1. Crear un repositorio nuevo en GitHub

Crea un repositorio independiente, por ejemplo `omnisocial`.

Sube **el contenido** de esta carpeta directamente a la raíz del repositorio. Debes ver en GitHub:

```text
omnisocial/
├── server.js
├── package.json
├── render.yaml
├── README.md
├── DEPLOY-RENDER.md
├── .env.example
├── .gitignore
├── src/
│   ├── db.js
│   └── schema.sql
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

No subas `.env` ni `node_modules`.

### 2. Crear el Blueprint en Render

En Render:

1. Dashboard.
2. `New`.
3. `Blueprint`.
4. Conecta tu cuenta de GitHub si todavía no está conectada.
5. Selecciona el repositorio `omnisocial`.
6. Render detectará `render.yaml`.
7. Confirma la creación de los recursos.

El Blueprint define:

- Web Service: `omnisocial`.
- PostgreSQL: `omnisocial-db`.
- Región: Frankfurt.
- `DATABASE_URL`: conectada automáticamente a PostgreSQL mediante la red privada de Render.
- `JWT_SECRET`: generado automáticamente por Render.
- Health check: `/api/health`.

Cuando termine, abre la URL `https://<tu-servicio>.onrender.com`.

### Importante sobre el plan gratuito

El `render.yaml` está configurado con plan `free` para empezar. Render solo permite una base PostgreSQL gratuita activa por workspace y las bases gratuitas caducan a los 30 días. Para conservar datos de usuarios reales a largo plazo, cambia la base a un plan de pago antes de esa fecha.

Si tu otro proyecto ya usa la única PostgreSQL gratuita de ese workspace, Render no podrá crear otra gratis. En ese caso puedes cambiar la línea de la base de datos en `render.yaml`:

```yaml
plan: 0.1c-256mb
```

antes de crear el Blueprint, o usar otro workspace/base existente de forma consciente.

## Opción B — Crear los recursos manualmente

Si prefieres hacerlo como tu otro proyecto:

### PostgreSQL

Render → `New` → `Postgres`.

- Name: `omnisocial-db`
- Region: Frankfurt
- Plan: el que quieras

Una vez creada, copia la **Internal Database URL**.

### Web Service

Render → `New` → `Web Service` → repositorio `omnisocial`.

Configura:

```text
Runtime: Node
Branch: main
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Region: Frankfurt
```

En `Environment` añade:

```text
DATABASE_URL = <Internal Database URL de omnisocial-db>
JWT_SECRET   = <una clave larga y aleatoria>
NODE_ENV     = production
```

Guarda y despliega.

## Comprobación

Abre:

```text
https://TU-DOMINIO.onrender.com/api/health
```

Debe responder algo parecido a:

```json
{"ok":true,"version":"0.2.0","database":"postgresql"}
```

Después abre la página principal, crea una cuenta y publica algo. Reinicia o vuelve a desplegar el servicio: la cuenta y las publicaciones deben seguir existiendo.

## Actualizaciones futuras

Cada vez que modifiques el proyecto y hagas push a `main`, Render puede desplegar automáticamente la nueva versión sin borrar los datos de PostgreSQL.
