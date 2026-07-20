# Quickstart: Validar el login + sidebar de admin

## Prerrequisitos

- `ADMIN_PASSWORD` y `SESSION_SECRET` configurados en el entorno.
- Servidor de desarrollo corriendo (`npm run dev`).

## 1. Login gate protege todo (US1)

Sin cookie de sesión:

```bash
curl -sI http://localhost:3000/admin/dashboard
curl -sI http://localhost:3000/admin/quotas
curl -sI http://localhost:3000/admin/conversations
```

**Resultado esperado**: las tres redirigen (30x) hacia `/`, sin servir el contenido de la página.

En el navegador, abrir `/` → debe verse el formulario de login (no el landing anterior). Enviar una contraseña incorrecta → mensaje de error visible, sigue en `/`. Enviar la contraseña correcta (`ADMIN_PASSWORD`) → redirige al área admin.

Con sesión activa, volver a abrir `/` → debe entrar directo al área admin, no mostrar el login de nuevo.

## 2. Sidebar persistente (US2)

En cualquier página admin, confirmar que el sidebar lista Conversaciones / Cuotas de reclutamiento / Dashboard de leads, que el ítem activo está resaltado, y que colapsar/expandir funciona (incluyendo el comportamiento responsive en pantalla angosta).

## 3. Conversaciones dentro de admin (US3)

Abrir `/admin/conversations` con sesión activa → debe verse la misma lista que antes. Abrir una conversación → mismo monitor en vivo de siempre.

```bash
curl -sI http://localhost:3000/conversations
```

**Resultado esperado**: redirige hacia `/admin/conversations` (no 404, no contenido servido directamente en la ruta vieja).

## 4. Logout (US4)

Con sesión activa, usar "Cerrar sesión" en el sidebar → debe volver a `/` mostrando el login. Repetir el `curl -sI` del paso 1 → deben volver a redirigir a `/`.

## Referencias

- Mecanismo de sesión (cookie firmada, sin tabla nueva): [research.md](./research.md) R1
- Reubicación de `/conversations`: [research.md](./research.md) R3
