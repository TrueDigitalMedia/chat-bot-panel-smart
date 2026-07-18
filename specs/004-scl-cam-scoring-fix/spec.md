# Feature Specification: Corrección de la fórmula de scoring SCL-CAM

**Feature Branch**: `004-scl-cam-scoring-fix`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Reemplazar la fórmula de scoring socioeconómico actual (arbitraria, 0-100) por la fórmula oficial SCL-CAM de Kantar Worldpanel: SCL = (45×NiPSH + 18×HACI + 28×AUTO + 9×SD)/100, con clasificación en Nivel 1-4, opciones de educación de 12 niveles, y etiquetas de género Masculino/Femenino. Ver docs/WIKI.md secciones 6 y 7."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cálculo del score SCL con la fórmula oficial (Priority: P1)

Como equipo de Kantar, necesito que el score socioeconómico (SCL) que calcula el bot para cada panelista siga exactamente la fórmula oficial de Kantar Worldpanel, para que la clasificación de nivel socioeconómico (NSE) sea confiable, auditable y comparable con la metodología usada en otros mercados.

**Why this priority**: El score SCL determina la clasificación NSE del panelista, que a su vez determina si califica para el cupo de reclutamiento. Una fórmula incorrecta produce clasificaciones erróneas y leads mal segmentados, afectando directamente la validez del panel.

**Independent Test**: Se puede probar de forma aislada ingresando un conjunto de respuestas conocidas (educación PSH, personas en el hogar, dormitorios exclusivos, autos, servicio doméstico) y verificando que el score SCL resultante coincide exactamente con el cálculo manual de la fórmula oficial, y que el nivel NSE asignado (Nivel 1/2/3/4) es el correcto según los umbrales oficiales.

**Acceptance Scenarios**:

1. **Given** un hogar con PSH con "Universidad Completa" (1000 pts), 2 dormitorios exclusivos y 4 personas en el hogar, 2+ autos y sin servicio doméstico, **When** se calcula el score SCL, **Then** el sistema produce el mismo resultado que aplicar manualmente `(45×1000 + 18×HACI_pts + 28×1000 + 9×0)/100` con `HACI = (10×4)/2 = 20` → 250 pts.
2. **Given** un hogar sin dormitorios exclusivos, **When** se calcula HACI, **Then** el sistema usa `HACI = 99` y le asigna 0 puntos (muy hacinado).
3. **Given** un score SCL calculado de exactamente 540, **When** se clasifica el nivel NSE, **Then** el sistema asigna "Nivel 1" (≥540).
4. **Given** un score SCL calculado de exactamente 180, **When** se clasifica el nivel NSE, **Then** el sistema asigna "Nivel 4" (≤180).

---

### User Story 2 - Opciones completas de nivel educativo del PSH (Priority: P2)

Como panelista respondiendo la encuesta, quiero poder seleccionar entre las 12 opciones oficiales de nivel educativo (incluyendo "No alfabetizado" y "Pos Grado Incompleto", que hoy faltan), para que mi respuesta se registre con precisión y no se fuerce a una categoría incorrecta.

**Why this priority**: Sin estas dos opciones, algunos panelistas no pueden reportar su nivel educativo real, lo que distorsiona el input de la fórmula NiPSH (que pesa 45% del score final).

**Independent Test**: Se puede probar mostrando la pregunta de nivel educativo y verificando que las 12 opciones oficiales están presentes y cada una mapea al puntaje correcto (0/0/0/0/250/250/250/400/900/1000/1000/1000).

**Acceptance Scenarios**:

1. **Given** la pregunta de nivel educativo del PSH, **When** se presentan las opciones, **Then** el sistema muestra las 12 categorías oficiales, incluyendo "No alfabetizado" y "Pos Grado Incompleto".
2. **Given** un panelista selecciona "No alfabetizado", **When** se calcula NiPSH, **Then** el sistema asigna 0 puntos.

---

### User Story 3 - Nomenclatura de segmentos NSE consistente con CAM (Priority: P3)

Como equipo de operaciones, quiero que los leads de la región CAM se clasifiquen y almacenen con la nomenclatura "Nivel 1/2/3/4" en vez de la nomenclatura de México ("A/B, C+, C, D+, D/E"), para que los reportes y el chequeo de cupo sean consistentes con las cuotas reales de Kantar CAM.

**Why this priority**: El sistema de cuotas de Kantar CAM (ver `Kantar Quotas Test.xlsx`) está definido en términos de Nivel 1-4. Usar la nomenclatura equivocada rompe el cruce contra cuotas reales.

**Independent Test**: Se puede probar generando un lead CAM y verificando que el campo de segmento almacenado usa uno de los valores "Nivel 1", "Nivel 2", "Nivel 3" o "Nivel 4".

**Acceptance Scenarios**:

1. **Given** un lead de un país CAM que completa la encuesta, **When** se persiste su segmento de cuota, **Then** el valor almacenado es uno de "Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4".

---

### User Story 4 - Opciones de género actualizadas (Priority: P4)

Como panelista, quiero que la pregunta de género use las opciones "Masculino" / "Femenino" (en vez de "Hombre" / "Mujer"), para que el flujo coincida con el cuestionario oficial actualizado.

**Why this priority**: Es un ajuste de menor impacto en el score (el género no forma parte de la fórmula SCL) pero necesario para alinear el flujo con el Excel oficial vigente.

**Independent Test**: Se puede probar mostrando la pregunta de género y verificando que las opciones son "Masculino" y "Femenino".

**Acceptance Scenarios**:

1. **Given** la pregunta de género, **When** se presentan las opciones, **Then** el sistema muestra "Masculino" y "Femenino" en vez de "Hombre" y "Mujer".

---

### Edge Cases

- ¿Qué ocurre si el hogar reporta 0 personas o 0 dormitorios exclusivos simultáneamente? (HACI debe usar el caso especial de "sin dormitorios exclusivos" → 99).
- ¿Qué ocurre si el score SCL calculado cae exactamente en un umbral límite (540, 325, 180)? El sistema debe aplicar los operadores exactos definidos (≥, >, <, ≤) sin ambigüedad.
- ¿Cómo se comportan los leads que ya fueron calificados con la fórmula anterior? (ver Assumptions — no se recalculan retroactivamente).
- ¿Qué ocurre si el número de dormitorios exclusivos reportado es mayor que el número de personas en el hogar? El cálculo de HACI debe seguir aplicándose sin error (puede dar un valor bajo, indicando "sin hacinamiento").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE calcular los puntos NiPSH usando la escala oficial de 12 niveles con valores 0/0/0/0/250/250/250/400/900/1000/1000/1000, según el nivel educativo declarado del PSH.
- **FR-002**: El sistema DEBE calcular HACI como `(10 × personas en el hogar) / dormitorios exclusivos`, usando `HACI = 99` cuando el hogar no tiene dormitorios exclusivos, y luego mapear ese valor a puntos según los umbrales oficiales (≥25→0, >15 y <25→250, ≥10 y ≤15→500, <10→1000).
- **FR-003**: El sistema DEBE calcular los puntos AUTO usando la escala 0 autos→0 pts, 1 auto→650 pts, 2+ autos→1000 pts.
- **FR-004**: El sistema DEBE calcular los puntos SD (servicio doméstico) usando la escala 0→0 pts, 1 o más→1000 pts.
- **FR-005**: El sistema DEBE calcular el score SCL final como `(45×NiPSH + 18×HACI + 28×AUTO + 9×SD) / 100`.
- **FR-006**: El sistema DEBE clasificar el score SCL en Nivel 1 (≥540), Nivel 2 (>325 y <540), Nivel 3 (>180 y ≤325), o Nivel 4 (≤180).
- **FR-007**: El sistema DEBE ofrecer las 12 opciones oficiales de nivel educativo del PSH en la pregunta correspondiente, incluyendo "No alfabetizado" y "Pos Grado Incompleto", que actualmente no están disponibles.
- **FR-008**: El sistema DEBE usar las etiquetas "Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4" como segmento de cuota para leads de la región CAM, en vez de la nomenclatura de México.
- **FR-009**: El sistema DEBE ofrecer las opciones "Masculino" y "Femenino" en la pregunta de género, en vez de "Hombre" y "Mujer".

### Key Entities *(include if feature involves data)*

- **SurveyProfile**: respuestas de la encuesta relevantes al score — nivel educativo del PSH, número de personas en el hogar, número de dormitorios exclusivos, número de autos, disponibilidad de servicio doméstico, género.
- **Lead**: registro del panelista candidato; contiene el segmento de cuota (`quota_segment`) que debe reflejar la nomenclatura Nivel 1-4 para CAM.
- **ScoringResult**: resultado calculado — score SCL numérico y nivel NSE asignado (Nivel 1-4).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para un conjunto de 100% de los casos de prueba con valores conocidos, el score SCL calculado por el sistema coincide exactamente con el resultado de aplicar manualmente la fórmula oficial de Kantar.
- **SC-002**: 100% de los leads nuevos de países CAM quedan clasificados con un segmento "Nivel 1/2/3/4"; cero leads nuevos usan nomenclatura de México.
- **SC-003**: La pregunta de nivel educativo del PSH ofrece las 12 opciones oficiales, verificado por revisión QA manual.
- **SC-004**: La pregunta de género ofrece "Masculino"/"Femenino", verificado por revisión QA manual.

## Assumptions

- Solo se corrige la nomenclatura de segmentos para la región CAM; los segmentos de México (A/B, C+, C, D+, D/E) y Ecuador (A, B, C, D, E) ya son correctos y no se modifican.
- Los leads ya calificados con la fórmula anterior no se recalculan retroactivamente en el alcance de esta feature; solo aplica a encuestas nuevas a partir del despliegue.
- Esta feature corrige únicamente la lógica de scoring y las opciones de las preguntas de educación y género; no agrega las preguntas nuevas de Fase 1 (opt-in, edad, embarazo, bebé) ni la Fase 4 interactiva, que se cubren en features separadas.
