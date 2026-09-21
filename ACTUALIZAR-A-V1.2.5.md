# Actualizar Instant Admirers V1.2.4 → V1.2.5

1. **No borres** Render ni PostgreSQL.
2. Descomprime `Instant-Admirers-V1.2.5-Perfiles-Directos.zip`.
3. Sube todo al mismo repositorio GitHub `allinone`, sustituyendo los archivos actuales.
4. Haz commit en `main`.
5. Espera el Auto-Deploy de Render.
6. Abre `https://instantadmirers.com/api/health` y confirma `"version":"1.2.5"`.

## Pruebas recomendadas

- Con una sesión abierta, entra en `https://instantadmirers.com/TUUSUARIO`.
- Abre esa misma URL en incógnito: debe mostrar login/registro y luego llevarte al perfil al iniciar sesión.
- Pulsa **Compartir perfil** y comprueba que genera `https://instantadmirers.com/TUUSUARIO`.
- Prueba una cuenta privada y otra con reto de acceso: la URL funciona pero las restricciones siguen aplicándose.
- Comprueba que una invitación especial a perfil usa ahora `/usuario?ref=...`.

No hay cambios de base de datos.
