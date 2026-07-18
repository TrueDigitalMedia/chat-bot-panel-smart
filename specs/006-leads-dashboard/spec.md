# Feature Specification: Dashboard de leads

**Feature Branch**: `006-leads-dashboard`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Construir una página de monitoreo en tiempo real del progreso de leads por país, NSE y región (equivalente dinámico del Excel de cuotas), con cards de resumen global, tabla de progreso región×NSE con color-coding, gráfico por país, embudo de conversión y filtros por país/NSE/región/canal/fecha. Ver docs/WIKI.md sección 10."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resumen global del progreso de la campaña (Priority: P1)

Como equipo de Kantar/Treinta, quiero ver un resumen global (objetivo total, conseguidos, disponibles, % de avance) al abrir el dashboard, para conocer de un vistazo el estado general del reclutamiento sin tener que abrir el Excel manualmente.

**Why this priority**: Es la vista más consultada y de mayor valor inmediato: reemplaza la necesidad de pedir o actualizar el Excel de seguimiento manualmente.

**Independent Test**: Se puede probar cargando el dashboard con datos de leads y cuotas conocidos, y verificando que las cards de resumen (objetivo/conseguidos/disponibles/% avance) coinciden con los totales calculados directamente desde la base de datos.

**Acceptance Scenarios**:

1. **Given** cuotas y leads calificados existentes en el sistema, **When** un administrador abre el dashboard, **Then** ve cards con el objetivo total, el total conseguido, el total disponible y el porcentaje de avance agregados.
2. **Given** que no hay leads calificados todavía, **When** se abre el dashboard, **Then** las cards muestran 0 conseguidos y 100% disponible, sin errores.

---

### User Story 2 - Progreso detallado por región y nivel NSE (Priority: P1)

Como equipo de campo, quiero ver el detalle de objetivo/conseguidos/disponibles por cada región y nivel NSE, con indicación visual de progreso (barra y color), para saber en qué regiones y segmentos enfocar el esfuerzo de reclutamiento.

**Why this priority**: Es la vista operativa principal para decidir dónde reforzar el reclutamiento; sin ella el resumen global no es suficientemente accionable.

**Independent Test**: Se puede probar comparando la tabla región×NSE del dashboard contra una consulta directa a la base de datos para varias combinaciones, verificando que los números y el color asignado (rojo <25%, amarillo 25–75%, verde >75%) son correctos.

**Acceptance Scenarios**:

1. **Given** una región con 10% de avance, **When** se muestra en la tabla, **Then** la celda se marca en rojo.
2. **Given** una región con 50% de avance, **When** se muestra en la tabla, **Then** la celda se marca en amarillo.
3. **Given** una región con 90% de avance, **When** se muestra en la tabla, **Then** la celda se marca en verde.

---

### User Story 3 - Embudo de conversión (Priority: P2)

Como gerente del programa, quiero ver un embudo de conversión (inicio de conversación → T&C → comprador del hogar → encuesta completa → calificado por NSE+cupo → registrado en app → ficha hogar completa), para identificar en qué paso se pierden más leads y priorizar mejoras al flujo.

**Why this priority**: Da visibilidad sobre la salud del flujo conversacional en su conjunto, complementario a las vistas de cuota, pero no bloquea el uso operativo diario del dashboard.

**Independent Test**: Se puede probar generando leads en distintos estados de la máquina de estados y verificando que el conteo en cada etapa del embudo coincide con el número real de leads que alcanzaron o superaron esa etapa.

**Acceptance Scenarios**:

1. **Given** un conjunto de leads en distintos estados (`not_qualified`, `link_sent`, `ficha_hogar_completada`, etc.), **When** se muestra el embudo, **Then** cada etapa refleja el conteo y porcentaje correcto de leads que la alcanzaron.

---

### User Story 4 - Filtros de segmentación (Priority: P2)

Como usuario del dashboard, quiero filtrar por país, nivel NSE, región, canal (Telegram/WhatsApp) y rango de fechas, para analizar subconjuntos específicos de datos sin tener que consultar la base de datos directamente.

**Why this priority**: Aumenta la utilidad de las vistas anteriores pero estas ya son funcionales sin filtros (mostrando todos los datos por defecto).

**Independent Test**: Se puede probar aplicando un filtro (p. ej. solo WhatsApp, o solo el último mes) y verificando que las cards, la tabla y el embudo se recalculan solo con los datos que cumplen el filtro.

**Acceptance Scenarios**:

1. **Given** el dashboard con datos de ambos canales, **When** el usuario filtra por canal "WhatsApp", **Then** todas las vistas (cards, tabla, embudo) se recalculan usando solo leads de WhatsApp.
2. **Given** el dashboard, **When** el usuario aplica un rango de fechas, **Then** solo se consideran leads creados dentro de ese rango.

---

### Edge Cases

- ¿Qué ocurre con una región+NSE sin objetivo configurado (0)? El % de avance debe mostrarse como "N/A" o 0%, sin división por cero.
- ¿Qué ocurre si un filtro no arroja ningún resultado (p. ej. un rango de fechas sin leads)? Las vistas deben mostrar un estado vacío claro, no un error.
- ¿Cómo se comportan los países sin cuotas configuradas aún (México, Ecuador)? Deben mostrarse con 0 conseguidos sin romper el resumen global.
- ¿Qué ocurre si un lead cambia de estado mientras el dashboard está abierto? Los datos deben actualizarse en el siguiente ciclo de refresco (polling) o al refrescar manualmente, no en tiempo real instantáneo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar cards de resumen global (objetivo total, conseguidos, disponibles, % de avance) agregando todas las cuotas activas.
- **FR-002**: El sistema DEBE mostrar una tabla de progreso por región × nivel NSE, con columnas objetivo/conseguidos/disponibles por celda.
- **FR-003**: El sistema DEBE indicar visualmente el nivel de avance de cada celda región/NSE mediante color-coding (rojo <25%, amarillo 25–75%, verde >75%).
- **FR-004**: El sistema DEBE mostrar un gráfico comparando el total conseguido contra el objetivo por país (CAM, México, Ecuador).
- **FR-005**: El sistema DEBE mostrar un embudo de conversión con el conteo/porcentaje de leads en cada etapa: iniciaron conversación → pasaron D1 → pasaron D3 → completaron encuesta → calificaron por NSE+cupo → registrados en app → ficha hogar completada.
- **FR-006**: El sistema DEBE permitir filtrar todas las vistas del dashboard por país, nivel NSE, región, canal (Telegram/WhatsApp) y rango de fechas.
- **FR-007**: El sistema DEBE refrescar los datos del dashboard automáticamente mediante polling, o permitir un refresco manual, reflejando el estado de los leads casi en tiempo real.
- **FR-008**: El sistema DEBE restringir el acceso al dashboard a administradores autenticados.
- **FR-009**: El sistema DEBE manejar sin errores combinaciones región/NSE sin objetivo configurado, mostrándolas como sin datos en vez de fallar.

### Key Entities *(include if feature involves data)*

- **Lead**: registro existente del panelista candidato — estado, canal, país, región, segmento NSE, marcas de tiempo por fase.
- **QuotaTarget**: objetivos de cuota por país/región/NSE (dependencia de la feature de panel administrativo de cuotas).
- **FunnelStage**: métrica derivada que representa el conteo de leads que alcanzaron cada etapa del flujo de calificación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede determinar el progreso total de la campaña (objetivo/conseguidos/disponibles) en menos de 5 segundos desde que abre el dashboard.
- **SC-002**: Los datos del dashboard reflejan cambios de estado de los leads dentro de un ciclo de refresco (máximo 60 segundos) sin necesidad de recargar manualmente.
- **SC-003**: Un usuario puede filtrar a una combinación específica de país+región+NSE y obtener conteos que coinciden con una consulta manual a la base de datos el 100% de las veces.
- **SC-004**: El embudo de conversión identifica correctamente la etapa con mayor caída de leads para el 100% de los rangos de fecha probados.

## Assumptions

- Esta feature depende del modelo de datos `QuotaTarget` introducido por el panel administrativo de cuotas (spec 005); si esa feature aún no está desplegada, los objetivos pueden obtenerse de datos semilla derivados del Excel existente como alternativa temporal.
- "Tiempo real" se interpreta como actualización casi inmediata vía polling cada 60 segundos, no actualizaciones push/WebSocket, según lo especificado en el WIKI.
- Inicialmente solo CAM tendrá métricas de cuota significativas; México y Ecuador mostrarán mayormente ceros hasta que esos mercados se activen operativamente.
- El acceso al dashboard reutiliza el mismo mecanismo de autenticación administrativa definido para el panel de cuotas (spec 005).
