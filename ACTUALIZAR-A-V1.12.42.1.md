# Actualizar de V1.12.42 a V1.12.42.1

1. Sube el PATCH a GitHub sobre V1.12.42.
2. Despliega normalmente en Render. No hay variables nuevas ni SQL manual.
3. Comprueba `/api/health`: `version: "1.12.42.1"`.
4. En Administración → Comunidad virtual → Centro de Calidad pulsa **Reparar calidad**.
5. Revisa el preview. En el estado detectado el resultado esperado es aproximadamente 59 portadas, 594 imágenes base legacy y 594 SHA-256.
6. Confirma la reparación y vuelve a ejecutar el Centro de Calidad.

La reparación no borra fotos. Mantiene un snapshot reversible.
