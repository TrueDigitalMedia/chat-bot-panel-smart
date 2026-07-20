# Feature Specification: Sync de Leads a TDM (Solo Escritura)

**Feature Branch**: `010-tdm-lead-sync`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Sync de leads a MySQL de TDM (solo escritura) — escribir un snapshot consolidado del lead en la tabla de TDM/Kantar en dos momentos: cuando Fase 1 se completa con cupo disponible, y cuando Ficha Hogar termina o se descarta. No toca el mock del código de registro."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - TDM recibe el lead apenas pasa cupo en Fase 1 (Priority: P1)

Como proceso interno de Kantar/TDM, quiero recibir un registro consolidado del lead tan
pronto como complete la encuesta inicial y tenga cupo disponible, para poder empezar a
trabajar ese lead (enviarle su código de registro) sin depender de que el bot termine el
resto de la conversación.

**Why this priority**: Este es el primer punto de contacto real con TDM y el que
desbloquea el resto del flujo de registro externo — sin esto, TDM no tiene ninguna
visibilidad de los leads que el bot está calificando.

**Independent Test**: Se puede probar completando la encuesta de Fase 1 de un lead que
cae dentro de cupo y verificando que aparece un registro correspondiente en el sistema de
TDM con los datos de contacto, geografía y scoring disponibles hasta ese punto.

**Acceptance Scenarios**:

1. **Given** un lead que completa la encuesta de Fase 1 y hay cupo disponible para su
   segmento, **When** el sistema procesa esa calificación, **Then** un registro
   consolidado del lead queda disponible en el sistema de TDM con los datos capturados
   hasta ese momento.
2. **Given** un lead ya sincronizado exitosamente en Fase 1, **When** el proceso se
   reintenta (p. ej. por un reinicio o reintento automático), **Then** no se crea un
   segundo registro duplicado para el mismo lead.
3. **Given** la sincronización con TDM está deshabilitada o sin configurar, **When** un
   lead completa Fase 1 con cupo disponible, **Then** la conversación continúa con
   normalidad y no se envía nada a TDM.

---

### User Story 2 - TDM recibe el perfil completo al terminar Ficha Hogar (Priority: P2)

Como proceso interno de Kantar/TDM, quiero recibir la actualización del registro del lead
con los datos del hogar (internet, mascotas, fecha de nacimiento, etc.) cuando el lead
termina el cuestionario de Ficha Hogar, para tener el perfil completo antes de
registrarlo como panelista.

**Why this priority**: Enriquece el registro ya creado en la Historia 1 con la
información necesaria para la decisión final de registro; depende de que ese registro ya
exista, por eso es prioridad P2.

**Independent Test**: Se puede probar completando Ficha Hogar para un lead que ya
sincronizó en Fase 1 y verificando que su registro en TDM se actualiza con los campos
adicionales del hogar, en vez de crear un registro nuevo.

**Acceptance Scenarios**:

1. **Given** un lead que ya tiene un registro sincronizado en TDM desde Fase 1,
   **When** completa el cuestionario de Ficha Hogar, **Then** ese mismo registro se
   actualiza con los datos adicionales del hogar, sin duplicarse.
2. **Given** un lead que nunca llegó a sincronizarse en Fase 1 (falló o estaba
   deshabilitado en ese momento), **When** completa Ficha Hogar, **Then** el sistema
   igual intenta dejar su información consolidada disponible en TDM, en vez de perderla
   silenciosamente.
3. **Given** falla la comunicación con el sistema de TDM al completar Ficha Hogar,
   **When** eso ocurre, **Then** el lead sigue avanzando con normalidad en el resto del
   proceso (por ejemplo, su registro en el sistema propio del bot no se ve afectado).

---

### User Story 3 - TDM se entera cuando un lead se descarta en Ficha Hogar (Priority: P3)

Como proceso interno de Kantar/TDM, quiero enterarme cuando un lead que había pasado
Fase 1 termina siendo descartado durante Ficha Hogar, para no seguir tratándolo como un
registro activo pendiente de procesar.

**Why this priority**: Es una señal de cierre de menor volumen que las anteriores, útil
para que TDM no gaste esfuerzo en leads que ya no calificarán, pero no bloquea el flujo
principal de leads calificados.

**Independent Test**: Se puede probar llevando a un lead a la rama de descarte inicial
de Ficha Hogar y verificando que su registro en TDM queda marcado como descartado.

**Acceptance Scenarios**:

1. **Given** un lead con registro sincronizado en TDM desde Fase 1, **When** es
   descartado en la primera pregunta de Ficha Hogar, **Then** su registro en TDM se
   actualiza para reflejar que fue descartado, sin borrar la información ya capturada.

---

### Edge Cases

- ¿Qué pasa si la sincronización está habilitada pero falta configuración necesaria
  (por ejemplo, faltan credenciales)? El sistema no debe fallar ni bloquear al usuario;
  simplemente no envía nada a TDM.
- ¿Qué pasa si el envío a TDM tiene éxito pero el sistema no logra registrar
  localmente que el envío fue exitoso (p. ej. una caída justo después)? Un reintento
  posterior podría generar un registro duplicado en TDM — riesgo aceptado y documentado,
  ya que no hay forma de que TDM detecte duplicados de su lado con la información
  disponible hoy.
- ¿Qué pasa si un campo que debería mapearse a TDM no está disponible para un lead en
  particular (p. ej. el usuario nunca respondió esa pregunta)? El registro se envía con
  ese campo vacío en vez de bloquear el envío completo.
- ¿Qué pasa si TDM no está disponible o responde con error? La conversación del usuario
  continúa sin interrupciones ni mensajes de error visibles para el usuario; el intento
  fallido queda registrado para revisión interna.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST enviar un registro consolidado del lead al sistema externo
  de TDM inmediatamente después de que un lead complete la encuesta inicial (Fase 1) y
  quede dentro de cupo disponible.
- **FR-002**: El sistema MUST actualizar ese mismo registro en TDM (no crear uno nuevo)
  cuando el lead complete el cuestionario de Ficha Hogar, agregando los datos adicionales
  del hogar capturados en esa etapa.
- **FR-003**: El sistema MUST actualizar el registro en TDM para reflejar que un lead fue
  descartado, cuando eso ocurra durante la primera pregunta de Ficha Hogar.
- **FR-004**: El sistema MUST evitar crear un registro duplicado en TDM para un mismo
  lead cuando el envío de Fase 1 se reintenta después de haber tenido éxito previamente.
- **FR-005**: Si un lead llega a la etapa de Ficha Hogar sin tener un registro previo
  exitoso en TDM, el sistema MUST intentar crear el registro en ese momento en vez de
  perder la información del lead.
- **FR-006**: El envío de información a TDM MUST ser opcional y estar deshabilitado por
  defecto; debe poder activarse mediante configuración sin requerir cambios de código.
- **FR-007**: Un fallo al comunicarse con TDM (red, credenciales, error del sistema
  externo) MUST NOT interrumpir ni degradar la conversación del usuario ni el resto del
  procesamiento interno del lead.
- **FR-008**: Cada intento de envío a TDM (exitoso o fallido) MUST quedar registrado
  internamente para poder auditar y depurar problemas de sincronización.
- **FR-009**: El sistema MUST enviar únicamente datos que ya fueron capturados
  legítimamente del lead durante la conversación (contacto, geografía, scoring, perfil de
  encuesta, perfil de hogar); MUST NOT inventar, adivinar o rellenar campos con valores
  arbitrarios.
- **FR-010**: Los campos que no tienen un origen de dato confiable en el sistema actual
  o cuyo propósito en el sistema de TDM es ambiguo MUST quedar vacíos en vez de
  completarse con una suposición.
- **FR-011**: El sistema MUST NOT modificar el proceso actual de generación/entrega del
  código de registro al usuario (ese código sigue siendo un valor simulado hasta que se
  aborde en un cambio aparte).
- **FR-012**: El sistema MUST NOT leer ni depender de datos que el proceso interno de
  TDM escriba de vuelta en su propio sistema (por ejemplo, confirmaciones de registro o
  identificadores asignados por Kantar) — esta sincronización es exclusivamente de
  salida.

### Key Entities *(include if feature involves data)*

- **Registro de Lead en TDM**: Snapshot consolidado de un lead — datos de contacto,
  ubicación, scoring/segmento, estado del proceso, perfil de encuesta y, cuando aplica,
  perfil de hogar — que vive en el sistema externo de TDM y es la vista que el proceso
  interno de Kantar usa para decidir el registro del lead como panelista.
- **Estado de Sincronización del Lead**: Información interna sobre si un lead ya tiene
  un registro creado en TDM, cuándo fue la última sincronización exitosa, y si el último
  intento falló — usada para decidir si el próximo evento debe crear o actualizar el
  registro externo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cuando un lead completa Fase 1 con cupo disponible y la sincronización
  está habilitada, un registro correspondiente queda disponible en el sistema de TDM en
  cuestión de segundos, sin que el usuario perciba ninguna demora adicional en la
  conversación.
- **SC-002**: El 100% de las conversaciones de usuario se completan con normalidad
  incluso cuando el sistema de TDM no está disponible o rechaza el envío — ningún error
  de sincronización llega a ser visible para el usuario final.
- **SC-003**: Con la sincronización deshabilitada (estado por defecto), el comportamiento
  del bot es idéntico al actual — cero cambios observables en la conversación o en los
  datos internos existentes.
- **SC-004**: En operación normal (sin caídas del sistema a mitad de un envío), el 100%
  de las actualizaciones de Ficha Hogar y descarte se reflejan como actualizaciones del
  mismo registro en TDM, no como registros duplicados.
- **SC-005**: El 100% de los campos enviados a TDM son trazables a un dato realmente
  capturado del lead durante la conversación — ninguno es inventado.

## Assumptions

- El destino de estos datos (el sistema externo de TDM/Kantar) y el contrato de qué
  información recibe ya fueron acordados como parte de la integración original del
  proyecto; esta funcionalidad implementa esa integración pendiente, no la negocia de
  nuevo.
- La correspondencia entre el estado detallado del lead en el bot y el estado
  simplificado que espera TDM es la mejor interpretación disponible hoy y queda sujeta a
  confirmación posterior con TDM; mientras tanto, el estado detallado también viaja sin
  simplificar para no perder información.
- Un pequeño número de campos (edad relacionada con la persona de referencia del hogar,
  condición de discapacidad) se mapean de la forma más cercana disponible en los datos
  existentes del bot, marcados como interpretación a confirmar con TDM, no como una
  garantía de equivalencia exacta.
- Los campos que TDM reserva para que su propio proceso interno los complete (por
  ejemplo, confirmaciones o identificadores de registro que asigna Kantar) quedan fuera
  del alcance de esta funcionalidad — este sistema solo escribe, nunca lee ni depende de
  esos campos.
- Reemplazar el código de registro simulado que hoy recibe el usuario por uno real
  proveniente de TDM es un cambio posterior, separado de esta funcionalidad.
- Es aceptable, en un escenario de falla poco frecuente (caída justo después de un envío
  exitoso), que un reintento produzca un registro duplicado en TDM — no se requiere un
  mecanismo de coordinación más sofisticado para la primera versión de esta
  funcionalidad.
