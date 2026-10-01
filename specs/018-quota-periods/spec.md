# Spec 018 — Periodos de cuota y cortes (Q1–Q4)

## Problema

Las cuotas no tenían dimensión temporal. Los conseguidos se contaban en vivo, all-time, y la única
forma de "cerrar" una cuota era editar el tope o apagar el flag `active` — lo que destruía el
histórico: no quedaba registro de con qué objetivo se corrió el trimestre ni de qué leads entraron.

## Decisiones de producto

1. **Alcance del periodo = por país.** Cada país tiene sus propios Q con sus fechas.
2. **Sin periodo abierto ⇒ nadie califica** en ese país (todo lead nuevo → `quota_exhausted`),
   consistente con la regla vigente "región sin objetivo configurado = cerrada".
3. **Abrir un Q nuevo arranca vacío** — los objetivos se cargan a mano o con el importador de Excel.
   No se copian las líneas del Q anterior ni se arrastra el faltante.
4. **Corte inicial** = un periodo ABIERTO por país con las cuotas actuales y todos los leads
   calificados existentes sellados. El comportamiento del bot no cambia.

## Requisitos funcionales

- **FR-001** Un país tiene a lo sumo un periodo abierto a la vez, garantizado en la base.
- **FR-002** Abrir un periodo valida país (contra `registry.ts`), trimestre 1..4, año y rango de fechas.
- **FR-003** Sin periodo abierto, `checkQuotaAvailability` y `checkRegionQuota` devuelven
  `periodo_cerrado` y **ningún** lead califica — excepción de embarazo/bebé incluida.
- **FR-004** El lead que califica queda sellado con el periodo en la misma escritura que su dimensión.
- **FR-005** Los conseguidos de un periodo se cuentan por el sello, nunca por ventana de fechas.
- **FR-006** Ninguna escritura de configuración entra en un periodo cerrado ni cruza países.
- **FR-007** Cerrar congela objetivo/conseguidos/faltante/% por región y por celda; es idempotente;
  no apaga `active` ni toca el sello de los leads.
- **FR-008** Reabrir un periodo cerrado borra su corte y requiere que no haya otro abierto del país.
- **FR-009** El corte expone la lista de leads que lo componen (descarga CSV).
- **FR-010** El panel avisa de forma visible qué países no tienen periodo abierto.
- **FR-011** El importador de Excel carga cada hoja en el periodo abierto de su país; una hoja sin
  periodo abierto se reporta en `unmatched`, nunca se carga en otro trimestre.

## Criterios de aceptación

- **SC-001** Tras la migración, los conseguidos por celda y el conteo de leads calificados son
  idénticos a los de antes (verificado: 172 celdas atribuidas, 1443 leads, 0 sin sellar).
- **SC-002** Cerrar un periodo deja al país sin recibir leads nuevos, con
  `status_reason='no_open_quota_period'`.
- **SC-003** Un periodo recién abierto y vacío deja todas las regiones del país en CERRADA.
- **SC-004** Re-cerrar un periodo ya cerrado devuelve el mismo corte, sin recalcular.
- **SC-005** Una línea de otro periodo no otorga cupo en el periodo en curso.

## Fuera de alcance

`src/lib/dashboard/funnel.ts` (`getConversionFunnel`) queda **global, sin alcance de periodo**: es
una vista de tasa de conversión y cuenta leads en todas las etapas, incluidas las previas a
calificar, que no tienen sello. Los conteos de *calificados* del dashboard sí son period-scoped
(`QualifiedCountFilters`), porque se leen contra el objetivo de un periodo concreto.
