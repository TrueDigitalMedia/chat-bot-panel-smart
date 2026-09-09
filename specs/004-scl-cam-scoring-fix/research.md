# Phase 0 Research: Corrección de la fórmula de scoring SCL-CAM

## R1: Fuente de verdad para los puntajes y pesos

- **Decision**: Usar exactamente las tablas y pesos documentados en `docs/WIKI.md` §6 (transcritos de `docs/cam/SCL-CAM.pdf`): NiPSH 12 niveles (0/0/0/0/250/250/250/400/900/1000/1000/1000), HACI por umbrales de `(10×personas)/dormitorios` (con caso especial `=99` sin dormitorios exclusivos), AUTO (0/650/1000), SD (0/1000), y la combinación final `(45×NiPSH + 18×HACI + 28×AUTO + 9×SD) / 100`.
- **Rationale**: Es la fuente oficial citada por el propio WIKI y coincide con el gap documentado en §7.1; no hay ambigüedad ni fuente alternativa.
- **Alternatives considered**: Ninguna — el spec y el WIKI son explícitos y no dejan margen de interpretación en los valores.

## R2: Manejo de redondeo para persistencia

- **Decision**: El resultado de la fórmula puede no ser entero (ej. `45×250 + 18×250 + 28×650 + 9×1000 = 42950 → /100 = 429.5`). Como `leads.score` es una columna `smallint`, el score se redondea con `Math.round()` antes de persistirlo y antes de clasificarlo en un nivel NSE.
- **Rationale**: `smallint` no admite decimales; redondear antes de clasificar mantiene la clasificación determinística y evita divergencia entre el valor mostrado/almacenado y el nivel asignado. Los umbrales oficiales (540, 325, 180) tienen suficiente separación de los posibles valores fraccionarios (siempre terminan en `.0` o `.5` dado que los pesos son múltiplos de 100 divididos entre 100) como para que el redondeo no cambie ningún caso límite documentado en los edge cases del spec.
- **Alternatives considered**: Cambiar la columna a `numeric`/`real` — rechazado porque no es necesario (el spec no pide precisión decimal en el resultado final) y añadiría una migración de esquema para un problema que el redondeo resuelve de forma más simple (Principio III — Simplicity/YAGNI).

## R3: Alcance de los cambios de nomenclatura de segmento

- **Decision**: Cambiar `getQuotaSegment` para devolver únicamente `"Nivel 1" | "Nivel 2" | "Nivel 3" | "Nivel 4"`. No se introduce una rama por país/región porque hoy no existe tal rama en el código: `calculateScore`/`getQuotaSegment` es la única implementación usada tanto por el flujo normal (`phase-1.ts`) como por el flujo de confirmación geográfica (`handle-confirm.ts`) y por el recálculo de QA (`qualification-eval.ts`).
- **Rationale**: Confirmado por búsqueda en el código: no existen literales `A/B`, `C+`, `D+`, `D/E` fuera de `socioeconomic.ts` y sus tests — no hay lógica de México/Ecuador que dependa de esos valores hoy. El spec (Assumptions) ya aclara que México/Ecuador no se tocan porque no están implementados todavía.
- **Alternatives considered**: Parametrizar `getQuotaSegment` por país para soportar múltiples nomenclaturas — rechazado por YAGNI; no hay ningún caller hoy que necesite otra nomenclatura, y agregar el parámetro sin un caso de uso real violaría el Principio III.

## R4: Dónde tipar los nuevos dominios de valores

- **Decision**: Mantener `educationPsh`, `gender` y `quotaSegment` como `string | null` en `SurveyProfile`/`Lead` (sin introducir un union literal estricto en `types/lead.ts`), y centralizar la validación de las opciones válidas en las constantes ya existentes de `survey-questions.ts` (`BUTTON_FIELDS` + las opciones de cada pregunta) y en las tablas de puntaje de `socioeconomic.ts`.
- **Rationale**: El resto del código ya trata estos campos como `string | null` de extremo a extremo (persistencia, eval, UI de monitoreo); introducir un union literal estricto tocaría más archivos de los necesarios para el alcance de este fix (Principio III) sin beneficio funcional, dado que la validación real ocurre en las opciones de botones que ya son la única forma de que el valor entre al sistema.
- **Alternatives considered**: Introducir `type EducationPsh = 'No alfabetizado' | ...` — rechazado por alcance excesivo frente al problema (corregir valores y fórmula, no el sistema de tipos).

## R5: Impacto en tests existentes

- **Decision**: Reescribir `tests/unit/scoring.test.ts` para verificar la fórmula oficial con casos conocidos (incluye el caso HACI=99 sin dormitorios, y los 4 umbrales de clasificación exactos: 540, 325, 180 y sus vecinos inmediatos). Actualizar los fixtures de `tests/unit/qualification-eval.test.ts` que hoy usan `'A/B'` y `'D/E'` para usar `'Nivel 1'`/`'Nivel 4'` (u otro nivel consistente con los datos de entrada del fixture).
- **Rationale**: Son los dos únicos archivos de test que referencian los valores de segmento o el comportamiento de la fórmula actual; deben actualizarse en el mismo cambio para no dejar la suite en rojo.
- **Alternatives considered**: Ninguna — es un requisito directo de mantener la suite verde.

## Resumen de unknowns resueltos

Ningún ítem de "Technical Context" quedó marcado como `NEEDS CLARIFICATION`; todas las decisiones de este documento se derivan directamente del código existente (confirmado por inspección) y de la fórmula oficial ya documentada en el WIKI/spec.
