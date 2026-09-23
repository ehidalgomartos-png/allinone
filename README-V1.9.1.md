# Instant Admirers V1.9.1 — Gestión de usuarios

Extiende V1.9.0 Growth Engine con administración completa de cuentas reales.

En **Administración → Gestión de usuarios** se pueden buscar cuentas, revisar su estado, suspender/reactivar y eliminarlas de forma definitiva. El borrado usa las relaciones `ON DELETE` ya existentes en PostgreSQL, limpia multimedia remota y deja rastro de auditoría.
