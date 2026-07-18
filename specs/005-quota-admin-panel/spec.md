# Feature Specification: Panel administrativo de cuotas

**Feature Branch**: `005-quota-admin-panel`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Reemplazar el archivo Excel Kantar Quotas Test.xlsx por un panel administrativo web dentro del proyecto Next.js que permita definir, visualizar, importar/exportar y actualizar los objetivos de leads por país, región y nivel socioeconómico, y conectar el chequeo de cupo del bot (checkQuotaAvailability) a estos datos reales en vez del mock aleatorio actual. Ver docs/WIKI.md sección 9 y 7.2."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verificación de cupo real en el bot (Priority: P1)

Como sistema de reclutamiento, cuando un panelista termina la encuesta y se calcula su nivel NSE, necesito verificar contra datos reales de cuota (no un resultado aleatorio) si hay cupo disponible en su país, región y nivel, para decidir correctamente si avanza a la Fase 2 o queda en `quota_exhausted`.

**Why this priority**: Es el problema más urgente: hoy el chequeo de cupo es un mock 50/50 determinista por ID de lead, lo que significa que las decisiones de calificación no reflejan la realidad y pueden sobre- o sub-reclutar segmentos completos sin que nadie lo note.

**Independent Test**: Se puede probar de forma aislada configurando un objetivo de cuota para una combinación país+región+NSE, generando leads calificados hasta alcanzar el objetivo, y verificando que el siguiente lead con esa combinación recibe `quota_exhausted` en vez de avanzar.

**Acceptance Scenarios**:

1. **Given** una cuota configurada con objetivo 10 y 10 leads ya calificados para esa región+NSE, **When** un nuevo lead completa la encuesta con esa misma región+NSE, **Then** el sistema determina que no hay cupo disponible y lo transiciona a `quota_exhausted`.
2. **Given** una cuota configurada con objetivo 10 y 5 leads calificados, **When** un nuevo lead completa la encuesta con esa combinación, **Then** el sistema determina que hay cupo disponible y el lead avanza a `link_sent`.
3. **Given** una combinación país+región+NSE sin ninguna cuota configurada, **When** un lead completa la encuesta con esa combinación, **Then** el sistema la trata como sin cupo disponible.

---

### User Story 2 - Visualizar y editar objetivos de cuota (Priority: P1)

Como administrador de Kantar, quiero ver y editar los objetivos de cuota por país, región y nivel NSE desde una interfaz web, para no depender de editar manualmente el archivo Excel y enviarlo por correo.

**Why this priority**: Es el reemplazo directo del proceso manual actual y la base de datos que alimenta el chequeo de cupo (User Story 1); sin esta interfaz, la única forma de actualizar cuotas sería una migración manual en la base de datos.

**Independent Test**: Se puede probar creando una cuota para una región+NSE nueva, editando su objetivo, y verificando que el cambio se refleja inmediatamente en la vista de progreso (objetivo/conseguidos/disponibles).

**Acceptance Scenarios**:

1. **Given** un administrador autenticado en el panel, **When** edita el objetivo de una celda región×NSE, **Then** el nuevo valor se guarda y la columna "disponibles" se recalcula automáticamente.
2. **Given** el panel de cuotas, **When** el administrador lo abre, **Then** ve todas las regiones y niveles NSE de CAM con sus columnas Objetivo/Conseguidos/Disponibles/% Avance.

---

### User Story 3 - Importar cuotas iniciales desde Excel (Priority: P2)

Como administrador, quiero importar en bloque los objetivos actuales del archivo `Kantar Quotas Test.xlsx`, para migrar los datos existentes sin tener que reingresarlos manualmente celda por celda.

**Why this priority**: Es necesario una sola vez para la migración inicial, pero no bloquea el uso del chequeo de cupo en tiempo real (User Story 1) si se decide poblar los datos iniciales por otro medio.

**Independent Test**: Se puede probar subiendo el archivo Excel de cuotas y verificando que las combinaciones región+NSE con sus objetivos quedan creadas en el sistema.

**Acceptance Scenarios**:

1. **Given** el archivo `Kantar Quotas Test.xlsx` con la hoja CAM, **When** el administrador lo importa, **Then** el sistema crea o actualiza una fila por cada combinación región+NSE presente en el archivo, con su objetivo correspondiente.

---

### User Story 4 - Activar/desactivar una región cerrada (Priority: P3)

Como administrador, quiero poder desactivar una combinación región+NSE cuando su cuota se cierra (aunque no haya alcanzado el 100%), para dejar de aceptar leads en esa combinación sin borrar el histórico de datos.

**Why this priority**: Es una funcionalidad operativa útil pero de menor frecuencia de uso que ver/editar cuotas o el chequeo de cupo en el bot.

**Independent Test**: Se puede probar desactivando una combinación región+NSE y verificando que un nuevo lead con esa combinación no puede avanzar aunque el objetivo no esté alcanzado.

**Acceptance Scenarios**:

1. **Given** una combinación región+NSE activa con cupo disponible, **When** el administrador la desactiva, **Then** el siguiente lead con esa combinación recibe `quota_exhausted` independientemente del conteo de conseguidos.

---

### User Story 5 - Exportar cuotas a Excel (Priority: P4)

Como administrador, quiero exportar el estado actual de las cuotas a un archivo Excel, para poder reportarlo a Kantar en el formato que ya utilizan.

**Why this priority**: Es una conveniencia de reporting, no bloquea ninguna funcionalidad operativa del bot.

**Independent Test**: Se puede probar exportando las cuotas actuales y verificando que el archivo generado contiene las mismas combinaciones y valores mostrados en el panel.

**Acceptance Scenarios**:

1. **Given** el panel de cuotas con datos cargados, **When** el administrador exporta, **Then** recibe un archivo Excel con una estructura equivalente a `Kantar Quotas Test.xlsx` (región × NSE con Objetivo/Conseguidos/Disponibles).

---

### Edge Cases

- ¿Qué ocurre si dos administradores editan el mismo objetivo de cuota al mismo tiempo? El sistema debe conservar el último valor guardado sin corromper datos.
- ¿Qué ocurre si el objetivo de una combinación región+NSE se reduce a un número menor que los leads ya conseguidos? "Disponibles" debe mostrarse como 0, nunca negativo, y la combinación debe tratarse como sin cupo.
- ¿Qué ocurre si se importa un archivo Excel con una combinación región+NSE que aún no tiene fila en `quota_targets`? El sistema debe crearla (upsert), no fallar. ¿Qué ocurre si el nombre de país o región de una fila **no coincide con ningún valor real del catálogo geográfico** (typo, nombre distinto al que usa la encuesta)? El sistema NO debe crearla — debe rechazar esa fila y reportarla en una lista de "no coincidentes" para revisión manual, ya que una cuota con un nombre de región inválido nunca podría acumular leads reales (mismo riesgo de bug silencioso identificado en la corrección de scoring, spec 004). *(Aclarado durante `/speckit.analyze` — la redacción original era ambigua entre estos dos casos distintos.)*
- ¿Qué ocurre si un usuario no autenticado intenta acceder al panel o a las rutas de API de cuotas? Debe ser rechazado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir a administradores autenticados visualizar los objetivos de cuota por país, región y nivel NSE.
- **FR-002**: El sistema DEBE permitir a administradores crear y editar el objetivo (target_count) de cada combinación país+región+NSE.
- **FR-003**: El sistema DEBE calcular en tiempo real el número de leads "conseguidos" a partir de los leads calificados que coinciden con cada región+NSE.
- **FR-004**: El sistema DEBE calcular "disponibles" como objetivo menos conseguidos, sin bajar de cero.
- **FR-005**: El sistema DEBE permitir importar en bloque los objetivos de cuota desde un archivo Excel con la estructura de `Kantar Quotas Test.xlsx`.
- **FR-006**: El sistema DEBE permitir exportar el estado actual de las cuotas (objetivo/conseguidos/disponibles) a un archivo Excel.
- **FR-007**: El sistema DEBE permitir activar/desactivar una combinación región+NSE; las combinaciones desactivadas DEBEN excluirse del chequeo de disponibilidad de cupo del bot.
- **FR-008**: El chequeo de disponibilidad de cupo del bot (`checkQuotaAvailability`) DEBE consultar los objetivos reales de cuota en vez de retornar un resultado aleatorio/mock.
- **FR-009**: El sistema DEBE restringir el acceso al panel administrativo y a sus rutas de API únicamente a administradores autenticados.
- **FR-010**: El sistema DEBE registrar cuándo se modificó un objetivo de cuota (marca de tiempo de última actualización) para dar trazabilidad básica a los cambios.

### Key Entities *(include if feature involves data)*

- **QuotaTarget**: objetivo de cuota por país, región y nivel NSE — incluye el conteo objetivo, si está activo, notas, y fechas de creación/actualización.
- **QuotaProgress**: vista derivada que cruza `QuotaTarget` con los leads reales calificados para calcular conseguidos y disponibles por combinación.
- **Lead**: registro existente del panelista candidato; se usa para contar los "conseguidos" por región+NSE.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede actualizar un objetivo de cuota y ver el cambio reflejado en la vista de progreso en menos de 5 segundos.
- **SC-002**: La decisión de aceptar/rechazar un lead nuevo por cupo coincide con el estado real de la cuota el 100% de las veces (se elimina por completo el comportamiento aleatorio del mock).
- **SC-003**: La migración inicial importa el 100% de las combinaciones región+NSE de la hoja CAM (33 regiones × 4 niveles = 132 celdas, objetivo total 3494 leads) sin reingreso manual. *(Corregido durante `/speckit.plan`: la tabla resumen del WIKI §8 omitió las filas con objetivo 0 al transcribir el Excel; se verificó contando directamente `docs/Kantar Quotas Test.xlsx` — 33 filas de región, no 19.)*
- **SC-004**: Un administrador puede desactivar una región cerrada en menos de 30 segundos, y el bot deja de aceptar leads para esa combinación en el siguiente chequeo de cupo.

## Assumptions

- La autenticación básica (contraseña compartida vía variable de entorno, según sugiere el WIKI) es suficiente para la v1 del panel; no se requiere manejo de roles ni múltiples usuarios administradores.
- Solo se migran datos de la hoja CAM en el alcance inicial; México y Ecuador pueden agregarse después usando el mismo modelo de datos (`quota_targets`), dado que sus hojas de Excel ya tienen una estructura equivalente.
- El campo `quota_segment` de los leads CAM debe usar la nomenclatura "Nivel 1-4" para poder cruzarse contra `QuotaTarget`; esa corrección de nomenclatura se asume resuelta por la feature de corrección de scoring (spec 004) y es una dependencia de esta feature, no parte de su alcance.
- "Región" se define con la misma granularidad usada en el Excel actual (p. ej. "Guatemala - Sur Occ. Chico"), sin desagregar a nivel de municipio.
