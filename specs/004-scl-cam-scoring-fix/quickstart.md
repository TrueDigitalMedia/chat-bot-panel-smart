# Quickstart: Validar la corrección de la fórmula SCL-CAM

## Prerrequisitos

- Repositorio con dependencias instaladas (`npm install` / `pnpm install`, según el lockfile del proyecto).
- No requiere base de datos ni variables de entorno adicionales — la validación principal es a nivel de unit test sobre funciones puras.

## 1. Validar la fórmula con casos conocidos (unit tests)

```bash
npx vitest run tests/unit/scoring.test.ts
```

**Resultado esperado**: todos los casos pasan, incluyendo (como mínimo):

- Un hogar con PSH "Universidad Completa" (1000 pts NiPSH), 2 dormitorios exclusivos, 4 personas (`HACI = 20 → 250 pts`), 2+ autos (1000 pts AUTO), sin servicio doméstico (0 pts SD) produce `score = (45×1000 + 18×250 + 28×1000 + 9×0)/100 = 775`, clasificado como **Nivel 1**.
- Un hogar sin dormitorios exclusivos usa `HACI = 99` → 0 puntos HACI, sin importar el número de personas.
- Los 4 umbrales de clasificación exactos (540, 325, 180) y sus vecinos inmediatos (539, 541, 324, 326, 179, 181) devuelven el nivel correcto según los operadores `≥/>/</≤` documentados.
- `getQuotaSegment` nunca devuelve `"A/B"`, `"C+"`, `"C"`, `"D+"` o `"D/E"` — solo `"Nivel 1"`..`"Nivel 4"`.

## 2. Validar el resto de la suite (regresión)

```bash
npx vitest run
```

**Resultado esperado**: `tests/unit/qualification-eval.test.ts` pasa con los fixtures actualizados a `Nivel 1`/`Nivel 4`; el resto de la suite no debería verse afectado (esta feature no toca rutas, webhooks ni el estado de la conversación).

## 3. Validar las opciones de encuesta manualmente (flujo conversacional)

1. Levantar el bot en modo desarrollo según el flujo habitual del proyecto (webhook local o modo mock, según corresponda).
2. Avanzar una conversación de prueba hasta la pregunta de género → verificar que las opciones mostradas son **Masculino** / **Femenino** (no "Hombre"/"Mujer").
3. Avanzar hasta la pregunta de nivel educativo del PSH → verificar que se muestran las **12 opciones oficiales**, incluyendo "No alfabetizado" y "Pos Grado Incompleto".
4. Completar la encuesta con un perfil de prueba conocido y verificar en la tabla `leads` (o en `/conversations/[id]`) que:
   - `score` refleja el cálculo de la fórmula oficial (ver data-model.md).
   - `quota_segment` es uno de `"Nivel 1"`, `"Nivel 2"`, `"Nivel 3"`, `"Nivel 4"`.

## Referencias

- Fórmula y tablas oficiales: [data-model.md](./data-model.md)
- Decisiones de diseño (redondeo, alcance de nomenclatura): [research.md](./research.md)
- Requisitos funcionales: [spec.md](./spec.md)
