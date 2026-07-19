# Quickstart: Validar el dashboard de leads

## Prerrequisitos

- `ADMIN_PASSWORD` configurado (mismo mecanismo que `/admin/quotas`, spec 005).
- Cuotas importadas (spec 005 quickstart §2) para que la tabla región×NSE y el gráfico tengan datos reales.
- Al menos algunos leads reales o de prueba en distintos estados, para que el embudo no esté vacío.

## 1. Resumen global (US1)

Abrir `http://localhost:3000/admin/dashboard` (credenciales Basic Auth) y confirmar que las 4 cards (Objetivo/Conseguidos/Disponibles/% Avance) coinciden con lo que ya se ve en `/admin/quotas`.

**Sin datos**: si no hay leads calificados, las cards deben mostrar `0 conseguidos` / `100% disponible` sin error.

## 2. Tabla región×NSE con color-coding (US2)

Confirmar que cada celda tiene su color según % de avance: rojo `<25%`, amarillo `25–75%`, verde `>75%`. Comparar 2-3 filas contra `/admin/quotas` — deben coincidir exactamente (misma función `listQuotaProgress()`).

## 3. Embudo de conversión (US3)

```bash
npx vitest run tests/unit/conversion-funnel.test.ts
```

En el navegador, confirmar que las 7 etapas se muestran en orden y que la etapa con mayor caída queda resaltada (SC-004).

## 4. Filtros (US4)

En la URL, probar:

```
/admin/dashboard?channel=whatsapp
/admin/dashboard?country=Guatemala&region=Sur%20Occidente%20Chico&nseLevel=Nivel%202
/admin/dashboard?from=2026-07-01&to=2026-07-18
```

**Resultado esperado**: cards/tabla/gráfico se recalculan según el filtro. El embudo respeta `channel`/`country`/rango de fechas pero **no** `region`/`nseLevel` (decisión documentada en research.md R4 — confirmar que esto es lo esperado, no un bug).

## 5. Refresco (US1, SC-002)

Dejar la página abierta, insertar/editar un lead directamente en la base (o vía el bot) y confirmar que el dashboard se actualiza solo dentro de 60 segundos, o al hacer clic en "Actualizar".

## Referencias

- Filtros por vista y forma de `ConversionFunnel`: [data-model.md](./data-model.md)
- Decisiones (sin recharts, sin rutas API, alcance de filtros en el embudo): [research.md](./research.md)
