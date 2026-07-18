# Quickstart: Validar el panel administrativo de cuotas

## Prerrequisitos

- `POSTGRES_URL` apuntando a una base de datos con la migración `0010_quota_targets.sql` aplicada.
- `ADMIN_PASSWORD` configurado en el entorno (ver research.md R5 — Basic Auth).
- Dependencias instaladas (`xlsx` ya está en `package.json`).

## 1. Migración de esquema

```bash
npx drizzle-kit generate   # si aún no se generó la migración 0010
npx drizzle-kit push       # o el flujo de migración habitual del proyecto
```

## 2. Importar las cuotas reales desde Excel (US3)

```bash
curl -u admin:$ADMIN_PASSWORD \
  -F "file=@docs/Kantar Quotas Test.xlsx" \
  http://localhost:3000/api/admin/quotas/import
```

**Resultado esperado**: `{"imported": 132, "unmatched": []}` — las 33 regiones × 4 niveles de la hoja `CAM` (ver research.md R1). Si `unmatched` no está vacío, revisar la normalización de país/región (research.md R2/R3) antes de continuar.

## 3. Verificar el resumen global

```bash
curl -u admin:$ADMIN_PASSWORD http://localhost:3000/api/admin/quotas | jq '.summary'
```

**Resultado esperado**: `{"totalTarget": 3494, "totalAchieved": <N>, "totalAvailable": <3494-N>}` — coincide con los totales verificados directamente del Excel en research.md R1 (el `totalAchieved` variará según los leads reales que ya existan en esta base de datos).

## 4. Validar el chequeo de cupo real (reemplaza el mock)

```bash
npx vitest run tests/unit/quota-progress.test.ts
npx playwright test tests/e2e/quota-check-real.spec.ts
```

**Resultado esperado**: un lead que completa la encuesta con una combinación país+región+NSE cuyo `available` es 0 (o cuya fila está `active: false`) recibe `quota_exhausted`; una combinación con `available > 0` avanza a `link_sent`. Confirmar que **no** aparece en los logs la línea `[quota:mock] ... (per-session)` del mock anterior — debe verse el nuevo log estructurado `event: quota_check` (ver plan.md § Constitution Check, Observability).

## 5. Editar un objetivo desde el panel (US2)

```bash
curl -u admin:$ADMIN_PASSWORD -X PUT \
  -H "Content-Type: application/json" \
  -d '{"targetCount": 60}' \
  http://localhost:3000/api/admin/quotas/<id>
```

Abrir `http://localhost:3000/admin/quotas` en el navegador (con las credenciales Basic Auth) y confirmar que la fila editada refleja el nuevo objetivo y que "disponibles"/% avance se recalculan sin recargar manualmente el cálculo (Server Component re-renderiza tras la mutación).

## 6. Desactivar una región (US4)

```bash
curl -u admin:$ADMIN_PASSWORD -X PUT \
  -H "Content-Type: application/json" \
  -d '{"active": false}' \
  http://localhost:3000/api/admin/quotas/<id>
```

Confirmar con el paso 4 que un lead con esa combinación ahora recibe `quota_exhausted` aunque `available` fuera > 0 antes de desactivar.

## 7. Exportar

```bash
curl -u admin:$ADMIN_PASSWORD http://localhost:3000/api/admin/quotas/export -o export-test.xlsx
```

Abrir `export-test.xlsx` y confirmar que las 132 filas y sus objetivos coinciden con el estado actual mostrado en `/admin/quotas`.

## Referencias

- Modelo de datos y cambio de contrato de `checkQuotaAvailability`: [data-model.md](./data-model.md)
- Contratos HTTP completos: [contracts/admin-quotas-api.md](./contracts/admin-quotas-api.md)
- Decisiones de diseño (auth, normalización de región, alcance de "conseguidos"): [research.md](./research.md)
