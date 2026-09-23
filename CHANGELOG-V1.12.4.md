# Instant Admirers V1.12.4 — Growth Engine Attribution

## Mensaje de acceso por campaña
- Nuevo campo `growth_campaigns.access_message` de hasta 220 caracteres.
- El mensaje de campaña tiene prioridad sobre el mensaje general del perfil.
- Prioridad final: **campaña → perfil → texto automático ES/EN**.
- Funciona en la pantalla previa de **Entrar / Crear cuenta** y dentro del perfil bloqueado.
- Las campañas existentes pueden editar el mensaje sin recrearlas.

## Procedencia de visitas
- Nueva tabla `growth_campaign_visits` para atribución propia.
- Se registra fuente, dominio de referencia cuando está disponible, UTM source/medium/campaign/content, dispositivo general, ruta de entrada y fecha/hora.
- No se almacena la IP en el detalle de Growth Engine.
- Nuevos enlaces con UTM automáticos.
- Nuevo campo `source_tag` para identificar una pieza concreta: Story, Reel, bio, post, etc.
- Canales disponibles ampliados con Google y Email.

## Panel Growth Engine
- Nuevo desplegable **Ver procedencia de las visitas** por campaña.
- Tabla fuente → visitas → registros → conversión.
- Referrers detectados.
- Distribución por dispositivo.
- Últimas visitas.
- Edición del mensaje de acceso y pieza/origen desde cada campaña.
- Las métricas históricas sin detalle se conservan como `histórico sin origen`.

## Registro y conversión
- `growth_campaign_attributions` guarda también la fuente/UTM de la alta.
- La conversión por fuente puede medirse aunque el navegador no envíe un referrer, utilizando el UTM de la campaña o el canal configurado.

## Privacidad y compatibilidad
- La política de privacidad ES/EN se actualiza para describir la atribución propia.
- No se añaden cookies publicitarias de terceros.
- No se requiere SQL manual.
- Se conservan V1.12.3, la protección multimedia y el proxy estable de V1.12.2.
