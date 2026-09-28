# Actualizar a V1.12.25

Base requerida: **V1.12.24**.

## Pasos

1. Guarda una copia de V1.12.24.
2. Sube todos los archivos de V1.12.25 al repositorio.
3. Espera a que Render finalice el despliegue.
4. Abre `/api/health` y confirma `version: "1.12.25"`.
5. Entra en Administración → Comunidad virtual.
6. Comprueba el contador de packs completos.
7. Si fuera necesario, pulsa **Sincronizar packs de imágenes** una sola vez; la operación es idempotente.
8. Abre varios perfiles → Imágenes y confirma 6 recursos activos por anfitrión.

## Resultado esperado

- Lucía V.: 6 fotografías sintéticas realistas del piloto.
- Perfiles 2–100: 6 recursos base por perfil (avatar, portada y cuatro escenas sintéticas) integrados en la biblioteca visual.
- Total esperado con los 100 perfiles: aproximadamente 600 recursos activos de pack.

No ejecutar SQL manualmente.
