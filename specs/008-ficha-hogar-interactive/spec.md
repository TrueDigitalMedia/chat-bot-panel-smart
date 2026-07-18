# Feature Specification: Ficha Hogar interactiva (Fase 4)

**Feature Branch**: `008-ficha-hogar-interactive`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Convertir la Fase 4 (Ficha Hogar) en un cuestionario conversacional interactivo con las 7 preguntas oficiales del Excel actualizado (descarte por conflicto de interés, acceso a internet, parentesco con jefe de familia, fecha de nacimiento, condición de salud, plan de datos móviles, número de mascotas), en vez de solo generar el resumen AI y persistir el panelista sin hacer estas preguntas. Ver docs/WIKI.md sección 4 (Fase 4) y sección 5 (Fase 4 - nuevas preguntas)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pregunta de descarte por conflicto de interés (Priority: P1)

Como sistema de reclutamiento, al entrar a Fase 4 necesito preguntar primero si el panelista o alguien en su hogar trabaja en publicidad, investigación de mercados, medios o la industria alimentaria, para descartarlo inmediatamente si la respuesta es "Sí", evitando incorporar panelistas con conflicto de interés al panel.

**Why this priority**: Es una pregunta de descarte con impacto directo en la validez del panel (conflicto de interés); debe evaluarse antes que cualquier otra pregunta de Ficha Hogar para evitar continuar un registro que de todas formas será rechazado.

**Independent Test**: Se puede probar respondiendo "Sí" a la pregunta de descarte y verificando que el flujo se detiene ahí, sin presentar las 6 preguntas restantes ni generar el resumen/persistencia estándar del panelista en Treinta.

**Acceptance Scenarios**:

1. **Given** un lead que llega a Fase 4, **When** el bot inicia el cuestionario, **Then** la primera pregunta es la de conflicto de interés (publicidad/investigación/medios/industria alimentaria).
2. **Given** una respuesta "Sí" a la pregunta de conflicto de interés, **When** el bot la procesa, **Then** el lead se marca como descartado, no se presentan las 6 preguntas restantes, y no se genera el resumen AI ni el registro estándar en Treinta.
3. **Given** una respuesta "No" a la pregunta de conflicto de interés, **When** el bot la procesa, **Then** el flujo continúa con las 6 preguntas restantes de Ficha Hogar.

---

### User Story 2 - Cuestionario completo de Ficha Hogar (Priority: P1)

Como panelista recién registrado en la app, respondo de forma conversacional las 6 preguntas restantes de Ficha Hogar (acceso a internet, parentesco con el jefe de familia, fecha de nacimiento, condición de salud permanente, plan de datos móviles ilimitado, número de mascotas), igual que respondí las preguntas de las fases anteriores.

**Why this priority**: Es el núcleo de la feature: hoy estas preguntas no se hacen en absoluto, y son parte del guion oficial requerido por Kantar para completar el perfil del panelista.

**Independent Test**: Se puede probar completando el cuestionario de Ficha Hogar de principio a fin y verificando que las 6 respuestas quedan almacenadas correctamente en el perfil del panelista.

**Acceptance Scenarios**:

1. **Given** un lead que respondió "No" a la pregunta de conflicto de interés, **When** continúa el flujo, **Then** el bot presenta en orden las preguntas de: acceso a internet, parentesco con el jefe de familia, fecha de nacimiento, condición de salud permanente, plan de datos móviles ilimitado, y número de mascotas.
2. **Given** una fecha de nacimiento con formato inválido o una fecha futura, **When** el usuario la envía, **Then** el bot re-solicita la fecha en vez de aceptarla.
3. **Given** que el usuario completa las 6 preguntas, **When** responde la última, **Then** el sistema tiene almacenadas las 7 respuestas de Ficha Hogar (incluyendo la de descarte).

---

### User Story 3 - Resumen AI y persistencia con datos reales de Ficha Hogar (Priority: P2)

Como sistema, genero el resumen AI del panelista y lo persisto en el sistema Treinta usando las respuestas recién capturadas de Ficha Hogar, en vez de generarlo sin esa información como ocurre hoy.

**Why this priority**: Es el paso final que le da valor a las respuestas capturadas en las User Stories 1 y 2; sin este paso, las respuestas quedarían almacenadas pero no reflejadas en el perfil final del panelista.

**Independent Test**: Se puede probar completando un cuestionario de Ficha Hogar con valores conocidos y verificando que el resumen AI generado y el registro persistido en Treinta reflejan esos valores (p. ej. el parentesco o el número de mascotas indicados).

**Acceptance Scenarios**:

1. **Given** un panelista que completó las 7 preguntas de Ficha Hogar sin ser descartado, **When** el sistema genera el resumen AI, **Then** el resumen incorpora la información de Ficha Hogar recién capturada.
2. **Given** el mismo panelista, **When** se persiste en Treinta, **Then** el registro incluye los campos de Ficha Hogar capturados.

---

### Edge Cases

- ¿Qué ocurre si el usuario responde "Sí" a la pregunta de descarte después de haber avanzado ya en fases anteriores (Fase 1-3 completas)? El lead debe quedar en un estado terminal distinto de `ficha_hogar_completada`, y no debe generarse el registro estándar en Treinta.
- ¿Qué ocurre si el usuario ingresa una fecha de nacimiento que lo haría menor de una edad mínima razonable o mayor a una edad máxima plausible? Debe re-solicitarse, igual que otras validaciones de la encuesta.
- ¿El usuario puede corregir una respuesta ya dada dentro de Ficha Hogar (p. ej. cambiar el número de mascotas)? Sí, debe soportarse igual que en Fase 1.
- ¿Qué ocurre con los leads que ya alcanzaron `ficha_hogar_completada` antes de este cambio (sin estas 7 respuestas)? No se les vuelve a pedir el cuestionario retroactivamente (ver Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE presentar la pregunta de descarte por conflicto de interés ("¿Trabajas tú o alguien en tu hogar en publicidad/investigación/medios/industria alimentaria?") como la primera pregunta de Fase 4.
- **FR-002**: Si la respuesta a la pregunta de descarte es "Sí", el sistema DEBE marcar al panelista como descartado y NO DEBE continuar con las preguntas restantes de Ficha Hogar ni persistir un registro estándar de panelista en Treinta.
- **FR-003**: Si la respuesta es "No", el sistema DEBE continuar con las 6 preguntas restantes de Ficha Hogar: acceso a internet, parentesco con el jefe de familia, fecha de nacimiento, condición de salud permanente, plan de datos móviles ilimitado, y número de mascotas.
- **FR-004**: El sistema DEBE validar que la fecha de nacimiento sea una fecha pasada plausible en formato DD/MM/AAAA, re-solicitándola si es inválida.
- **FR-005**: El sistema DEBE permitir la corrección de respuestas ya dadas dentro de Ficha Hogar, de forma consistente con el mecanismo de corrección usado en Fase 1.
- **FR-006**: El sistema DEBE persistir las 7 respuestas de Ficha Hogar en el perfil del panelista.
- **FR-007**: El sistema DEBE generar el resumen AI y persistir el panelista en Treinta únicamente después de completar las 7 preguntas de Ficha Hogar (o de determinar el descarte según FR-002).
- **FR-008**: El sistema DEBE presentar el cuestionario de Ficha Hogar de forma consistente tanto en el canal de Telegram como en el de WhatsApp.
- **FR-009**: El sistema DEBE transicionar el lead a un estado terminal distinto de `ficha_hogar_completada` cuando es descartado por la pregunta de conflicto de interés.

### Key Entities *(include if feature involves data)*

- **FichaHogarProfile**: respuestas del cuestionario de Ficha Hogar — conflicto de interés, acceso a internet, parentesco con jefe de familia, fecha de nacimiento, condición de salud, plan de datos móviles, número de mascotas.
- **Lead**: registro del panelista candidato; su estado puede transicionar a un nuevo estado terminal de descarte, o continuar a `ficha_hogar_completada` tras completar el cuestionario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los leads que llegan a Fase 4 reciben la pregunta de descarte antes que cualquier otra pregunta de Ficha Hogar.
- **SC-002**: El 100% de los leads que responden "Sí" a la pregunta de descarte quedan excluidos del sistema de panelistas Treinta.
- **SC-003**: Para los leads no descartados, las 6 preguntas restantes de Ficha Hogar quedan capturadas y almacenadas para al menos el 95% de los leads que llegan a Fase 4, verificado mediante los datos de perfil.
- **SC-004**: El resumen AI generado para un panelista refleja sus respuestas reales de Ficha Hogar (no valores vacíos o placeholder) para el 100% de los leads completados, verificado mediante muestreo manual de QA.

## Assumptions

- Los leads descartados en Ficha Hogar transicionan a un nuevo estado terminal (p. ej. `ficha_hogar_descartado`), separado de `ficha_hogar_completada`, siguiendo el mismo patrón de estados terminales dedicados que ya usa la máquina de estados (`code_delivered_not_registered`, `code_delivered_no_response`).
- La fecha de nacimiento se captura como texto libre en formato DD/MM/AAAA y solo se valida por plausibilidad (no ser fecha futura, estar en un rango de edad razonable), de forma consistente con otras preguntas de texto libre del flujo.
- Esta feature solo agrega el cuestionario interactivo; no cambia cómo ni dónde se consume el resumen AI generado río abajo en Treinta.
- Los leads que ya alcanzaron `ficha_hogar_completada` antes de este cambio no se re-encuestan retroactivamente; el cuestionario interactivo aplica solo a leads que entren a Fase 4 después del despliegue.
