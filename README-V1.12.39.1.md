# Instant Admirers V1.12.39.1 — Descubrir Balance Hotfix

Hotfix sobre V1.12.39 para adaptar Descubrir 2.0 a la fase actual de la comunidad, donde todavía hay pocos perfiles reales.

## Cambios principales

- Prioridad adaptativa para perfiles reales: no hay una cuota fija. Se muestran primero los perfiles reales válidos para el filtro y los perfiles virtuales completan los huecos disponibles.
- En `Activos`, un perfil real solo recibe esa prioridad si está online o ha tenido actividad reciente.
- La columna derecha `Personas para ti` aplica el mismo criterio real-first.
- Descubrir evita repetir en la columna derecha los perfiles que ya aparecen en el carrusel principal.
- Carrusel de escritorio ajustado a 3 tarjetas completas por vista, con controles anterior/siguiente.
- Carrusel móvil ligeramente más compacto para dejar visible parte de la siguiente tarjeta.
- Distintivo `Miembro fundador` más compacto en móvil.
- Los perfiles virtuales siguen claramente identificados como `Virtual`.
- No se modifica el ranking de publicaciones de Descubrir: las interacciones virtuales siguen sin impulsar posiciones.

No requiere migración manual de base de datos.
