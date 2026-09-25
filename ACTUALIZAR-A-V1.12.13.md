# Actualizar a V1.12.13

1. Sustituye los archivos de la versión anterior por los de este paquete.
2. Sube los cambios a GitHub y despliega en Render.
3. No añadas variables nuevas y no ejecutes SQL manualmente.
4. Tras el despliegue, abre `/api/health` y confirma `"version":"1.12.13"`.
5. Haz Ctrl+F5 o cierra y vuelve a abrir la PWA.

## Prueba recomendada

- Perfil A: reto de acceso activado.
- Perfil B: reto todavía sin completar.
- B no debe poder enviar texto, foto ni vídeo a A.
- Si ya existía una conversación, B debe verla en modo lectura con el aviso de reto.
- Tras completar el reto, el compositor debe volver a estar disponible.
- Si B había enviado un mensaje antes de esta corrección, A debe poder responder a B aunque la política de B sea restrictiva, salvo bloqueo.
