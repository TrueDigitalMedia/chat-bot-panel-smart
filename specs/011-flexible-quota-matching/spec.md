# Feature Specification: Cuotas flexibles por dimensión

**Feature Branch**: `011-flexible-quota-matching`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Cambiar la elegibilidad de cuota de panelistas: un lead califica si cumple al menos una condición de cuota disponible (NSE, edad, o tamaño de hogar) dentro de su región, en vez de requerir que todas coincidan. Todas las regiones quedan abiertas para reclutamiento. Cada región tiene un tope agregado de leads que bloquea nuevos registros al alcanzarse, incluso si alguna dimensión individual sigue con cupo. Hogares con embarazada o bebé de 0-36 meses siempre califican sin límite de cuota. Aplica a todos los países (CAM, México, Ecuador, RD). Reemplaza el modelo actual de quota_targets (country+region+nse_level, spec 005) que exige coincidencia simultánea."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Calificar por cualquier dimensión con cupo disponible (Priority: P1)

Como sistema de reclutamiento, cuando un panelista termina la encuesta y se calcula su NSE, edad y tamaño de hogar, necesito calificarlo si **cualquiera** de esas tres condiciones todavía tiene cupo disponible en su región, en vez de exigir que las tres coincidan a la vez, para no rechazar leads válidos que hoy se pierden por no cumplir todas las condiciones simultáneamente.

**Why this priority**: Es el cambio de negocio central solicitado — hoy el bot descarta leads que cumplen sobradamente una condición de cuota (p. ej. tamaño de hogar) solo porque no coinciden también en NSE, lo que sub-llena cuotas reales.

**Independent Test**: Se puede probar de forma aislada configurando cupo agotado en NSE pero disponible en edad para una región dada, generando un lead con ese NSE agotado pero esa edad con cupo, y verificando que el lead califica.

**Acceptance Scenarios**:

1. **Given** una región con cupo agotado en NSE SCL1 y en edad "50+", pero con cupo disponible en integrantes "5+", **When** un lead de esa región tiene NSE SCL1, edad 50+ e integrantes 5+, **Then** el sistema lo califica como panelista (por la dimensión de integrantes).
2. **Given** una región con cupo disponible en NSE SCL4 pero agotado en edad "35 a 49" e integrantes "3 a 4", **When** un lead de esa región tiene NSE SCL4, edad 35-49 e integrantes 3-4, **Then** el sistema lo califica como panelista (por la dimensión de NSE).
3. **Given** una región donde NSE, edad e integrantes del lead están todos agotados, **When** el lead completa la encuesta, **Then** el sistema no lo califica (transiciona a `quota_exhausted`), salvo que aplique la excepción de embarazo/bebé (User Story 3).

---

### User Story 2 - Reclutar en cualquier región mientras haya cupo (Priority: P1)

Como sistema de reclutamiento, ya no debo excluir de antemano ninguna región del país — cualquier región puede aportar leads mientras cumpla alguna condición de cuota disponible, salvo que haya alcanzado su tope agregado de saturación.

**Why this priority**: Junto con la User Story 1, elimina la restricción combinada región+NSE que hoy bloquea leads geográficamente válidos; sin esto, regiones enteras quedarían cerradas aunque tengan cupo disponible en alguna dimensión.

**Independent Test**: Se puede probar generando un lead en una región que hoy no tiene ninguna fila de `quota_targets` activa (región "cerrada" bajo el modelo actual) pero que sí tiene cupo disponible en al menos una dimensión bajo el nuevo modelo, y verificando que el lead califica.

**Acceptance Scenarios**:

1. **Given** una región sin cupo agotado en ninguna dimensión, **When** un lead de esa región completa la encuesta, **Then** el sistema evalúa sus tres dimensiones (NSE, edad, integrantes) igual que en cualquier otra región del país.
2. **Given** una región que alcanzó su tope agregado de saturación (ver User Story 4), **When** un lead de esa región completa la encuesta y no aplica la excepción de embarazo/bebé, **Then** el sistema no lo califica, aunque alguna dimensión individual siga con cupo.

---

### User Story 3 - Excepción sin límite para embarazo o bebé de 0-36 meses (Priority: P1)

Como sistema de reclutamiento, cuando un hogar reporta que la panelista está embarazada o que hay un bebé de hasta 36 meses, debo calificar al lead como panelista sin evaluar NSE, edad ni integrantes, y sin que consuma ni sea bloqueado por ningún tope de cuota.

**Why this priority**: Es una excepción explícita del negocio, aplicable a todos los países, que hoy se captura (`is_pregnant`, `has_baby_under_3`) pero no tiene ningún efecto en la calificación.

**Independent Test**: Se puede probar generando un lead cuyo NSE, edad e integrantes están todos agotados en su región, marcando `is_pregnant` o `has_baby_under_3` en true, y verificando que igual califica.

**Acceptance Scenarios**:

1. **Given** un hogar con `is_pregnant = true`, **When** el lead completa la encuesta, **Then** el sistema lo califica como panelista sin evaluar cupo de NSE, edad ni integrantes.
2. **Given** un hogar con `has_baby_under_3 = true` y una región que ya alcanzó su tope agregado de saturación, **When** el lead completa la encuesta, **Then** el sistema lo califica igual, sin que el tope de la región lo bloquee, y el lead se contabiliza en el total de leads calificados de esa región para efectos de reporte/balance (aunque nunca sea rechazado por ese total).

---

### User Story 4 - Tope agregado por región para evitar saturación (Priority: P2)

Como negocio, aunque todas las regiones estén abiertas, necesito que cada región tenga un límite máximo de leads aceptados en total, para no concentrar todo el reclutamiento en las regiones más fáciles de calificar.

**Why this priority**: Es la salvaguarda pedida explícitamente para balancear el reclutamiento; depende de que las User Stories 1 y 2 ya estén implementadas (abrir todas las regiones sin este tope saturaría las regiones más permisivas).

**Independent Test**: Se puede probar configurando un tope agregado bajo para una región, generando leads calificados hasta alcanzarlo, y verificando que el siguiente lead de esa región (que de otra forma calificaría por alguna dimensión) es rechazado.

**Acceptance Scenarios**:

1. **Given** una región con tope agregado de 50 leads y 50 leads ya calificados (por cualquier combinación de dimensiones), **When** un nuevo lead de esa región completa la encuesta y cumple una dimensión con cupo individual disponible, **Then** el sistema no lo califica por haber alcanzado el tope agregado de la región.
2. **Given** una región con tope agregado de 50 leads y 30 leads calificados, **When** un nuevo lead de esa región completa la encuesta, **Then** el sistema evalúa normalmente sus dimensiones (User Story 1) porque el tope de región aún no se alcanzó.

---

### Edge Cases

- ¿Qué pasa si un lead califica simultáneamente por dos o tres dimensiones a la vez (p. ej. NSE y edad ambos con cupo)? El sistema lo califica una sola vez como panelista y descuenta su conteo únicamente de la dimensión que lo calificó, evaluando en orden fijo NSE → edad → integrantes (la primera dimensión de ese orden que tenga cupo disponible es la que se usa y la que se descuenta); las demás dimensiones que el lead también cumple no se ven afectadas.
- ¿Qué pasa con un país/región que no tiene fila de cuota configurada en absoluto para ninguna dimensión? Se trata como sin cupo disponible en esa región (mismo comportamiento que hoy cuando no hay fila para la combinación).
- ¿Qué pasa si el tope agregado de una región no está configurado (valor nulo/ausente)? Debe tratarse como "sin tope" (la región no se bloquea por saturación, solo por agotamiento de las dimensiones individuales) para no bloquear accidentalmente regiones que el administrador no haya configurado todavía.
- ¿Cómo se determina el valor del tope agregado de cada región? Es un valor manual que el administrador configura explícitamente por región desde el panel de cuotas (`/admin/quotas`), independiente de los objetivos por dimensión (NSE/edad/integrantes) — no se deriva automáticamente de ellos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE calificar a un lead como panelista si al menos una de sus dimensiones de cuota (NSE, edad, tamaño de hogar) tiene cupo disponible en la región del lead, sin exigir que las tres coincidan simultáneamente.
- **FR-002**: El sistema DEBE permitir evaluar leads de cualquier región del país — ninguna región puede excluirse de antemano del reclutamiento.
- **FR-003**: El sistema DEBE calificar automáticamente, sin evaluar cupo de NSE/edad/integrantes, a todo lead cuyo hogar reporte embarazo (`is_pregnant`) o un bebé de hasta 36 meses (`has_baby_under_3`).
- **FR-004**: El sistema DEBE aplicar un tope agregado de leads aceptados por región (valor configurado manualmente por el administrador, independiente de los objetivos por dimensión) que, al alcanzarse, impide calificar nuevos leads de esa región aunque alguna dimensión individual siga con cupo disponible — excepto los leads cubiertos por la excepción de embarazo/bebé (FR-003), que nunca son bloqueados por este tope pero sí se contabilizan en el total de la región.
- **FR-005**: El sistema DEBE soportar cupos independientes por NSE, por rango de edad y por tamaño de hogar, para cada región de cada país (CAM, México, Ecuador, República Dominicana).
- **FR-006**: El sistema DEBE tratar una región/país sin ninguna dimensión de cuota configurada como sin cupo disponible (mismo comportamiento que el modelo actual ante combinaciones sin fila de cuota). Una región sin tope agregado configurado se trata como "sin tope" (no bloquea por saturación).
- **FR-007**: Cuando un lead cumple varias dimensiones con cupo disponible a la vez, el sistema DEBE evaluarlas en orden fijo NSE → edad → integrantes y descontar el conteo de "conseguidos" únicamente de la primera dimensión de ese orden que tenga cupo disponible — las demás dimensiones que el lead también cumple no se descuentan.
- **FR-008**: El sistema DEBE seguir registrando el NSE, edad e integrantes reales del lead calificado (para reporting), independientemente de cuál dimensión lo haya calificado según FR-007.
- **FR-009**: El panel administrativo de cuotas (`/admin/quotas`, spec 005) DEBE permitir definir y editar los objetivos por dimensión (NSE, edad, integrantes) y el tope agregado manual por región, reemplazando la definición actual limitada a país+región+NSE.

### Key Entities *(include if feature involves data)*

- **Cupo por dimensión (quota target)**: objetivo de leads para una combinación de país + región + tipo de dimensión (NSE, edad, o integrantes) + valor de esa dimensión (p. ej. "SCL1", "50+", "5+"). Reemplaza al cupo actual de país+región+NSE único.
- **Tope agregado de región (region cap)**: límite máximo de leads calificados en total para una combinación país + región, configurado manualmente por el administrador, independiente de las dimensiones individuales.
- **Perfil de encuesta (survey profile)**: ya existente; aporta el NSE, la edad, el tamaño de hogar, y las banderas de embarazo/bebé del lead que se evalúan contra los cupos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ningún lead que cumpla al menos una condición de cuota disponible en su región es rechazado únicamente por no cumplir las demás condiciones a la vez.
- **SC-002**: El 100% de las regiones del país quedan disponibles para calificar leads (ninguna región queda excluida por configuración), sujeto únicamente al tope agregado de cada región.
- **SC-003**: El 100% de los leads con embarazo o bebé de hasta 36 meses reportado califican como panelistas, independientemente del estado de cupo de sus otras dimensiones.
- **SC-004**: Ninguna región supera su tope agregado configurado de leads calificados (excluyendo los calificados por la excepción de embarazo/bebé).
- **SC-005**: El equipo de Kantar puede consultar, para cualquier país, cuántos leads se calificaron por región y por dimensión, para verificar que el reclutamiento no se concentra desproporcionadamente en una sola región.

## Assumptions

- La agrupación geográfica en "región" sigue usando el mismo catálogo departamento/municipio → región ya existente (`data/geo/cam-nse-regions.json`, spec 002); esta feature no cambia cómo se determina la región de un lead, solo cómo se usa esa región en el chequeo de cupo.
- Los rangos de edad ("Hasta 34", "35 a 49", "50+") y de integrantes ("1 a 2", "3 a 4", "5+") son los mismos que aparecen en `docs/Muestra Faltante por País Julio 2026_True.xlsx`, ya capturados hoy en la encuesta (edad y household size vía Ficha Hogar) pero no usados aún para cuota.
- Este cambio aplica a todos los países servidos por el bot (CAM completo, México, Ecuador, República Dominicana), no solo a los que ya tienen `quota_targets` activo hoy.
- El panel administrativo de cuotas (spec 005) se actualiza como parte de esta feature para poder cargar/editar los nuevos cupos por dimensión y el tope agregado por región, en vez de mantenerse limitado al modelo país+región+NSE.
- La lógica de scoring NSE (SCL-CAM, spec 004) no cambia — esta feature solo cambia cómo se usa el resultado del scoring (junto con edad e integrantes) para decidir cupo, no cómo se calcula.
