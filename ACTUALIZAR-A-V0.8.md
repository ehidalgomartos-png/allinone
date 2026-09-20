# Actualizar OmniSocial V0.7.1 → V0.8

1. **No borres** el Web Service de Render ni `omnisocial-db`.
2. Descomprime `OmniSocial-V0.8-Para-Ti.zip`.
3. Sube el contenido a la raíz del mismo repositorio GitHub, sustituyendo los archivos existentes.
4. Haz commit.
5. Render iniciará el deploy automáticamente. Si no lo hace: **Manual Deploy → Deploy latest commit**.
6. Comprueba `/api/health`.

Resultado esperado:

```json
{
  "ok": true,
  "version": "0.8.0",
  "database": "postgresql",
  "mode": "own-community"
}
```

## Qué cambia

- Nuevo feed `Para ti`.
- Inicio permite cambiar entre `Siguiendo` y `Para ti`.
- Personas recomendadas.
- Descubrir personalizado.
- Explicación breve del motivo de cada recomendación.
- Dos índices nuevos de PostgreSQL; no se elimina ningún dato.

No hay variables de entorno nuevas.
