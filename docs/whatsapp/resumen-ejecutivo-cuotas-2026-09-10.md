# Resumen ejecutivo — Ajuste de cuotas y mensaje final

**Fecha:** 2026-09-10
**Alcance:** CAM, República Dominicana, Ecuador y México
**Estado:** implementado, en revisión para deploy

---

## 1. El problema

El bot estaba **sobre-entregando leads**. La lógica original trataba cada condición
(NSE, edad, integrantes, embarazo/bebé) como un cupo casi independiente, en vez de
respetar el pedido real del cliente: **X panelistas por país, región y nivel socioeconómico**.

Consecuencias medidas sobre la base de producción al 2026-09-10:

| Indicador | Valor |
|---|---|
| Regiones que superaron su objetivo | **14** |
| Leads entregados por encima del objetivo de su región | **~115** |
| Leads calificados **sin región identificada** | **34** |
| Total fuera de la solicitud del cliente | **~149 leads** |

Casos más graves: Panamá / Centro I (objetivo 57 → 93 leads), El Salvador / Centro I
(región fuera de muestra, 9 leads), R. Dominicana / Santo Domingo (100 → 107).

Cada lead de más es inversión propia en un esfuerzo que el cliente no pidió ni paga.
Por eso se apagaron manualmente 3 países (El Salvador, Honduras, Panamá).

---

## 2. La regla correcta (según el cliente)

1. **Primer condicional — el techo:** el cliente pide una cantidad de leads por
   **país + región + NSE**. Ese número es el límite. Nada es infinito.
2. **Segundo condicional — embarazo / bebé menor a 3 años:** permite calificar a un lead
   sin importar su NSE, **pero siempre dentro del país y la región pedidos**.
3. **Tercer condicional — edad e integrantes del hogar:** igual que el segundo, amplía
   por encima del NSE **pero nunca por encima de la región y el país**.

Los condicionales 2 y 3 **completan** la cuota del primero, **no la aumentan**. Un lead
que aplica por condicional pero cuyo NSE ya está lleno se descuenta de otra línea NSE de
la misma región que todavía tenga lugar.

---

## 3. Qué se cambió en el sistema

**a) El objetivo por país + región pasa a ser un techo duro para todos.**
Se calcula como el número que carga el equipo en el panel, o —si no está cargado— como la
suma de las líneas NSE de esa región. Cuando se alcanza, **todo lead nuevo de esa región
va a "cuota agotada"**, incluidos los de embarazo/bebé y los de edad/integrantes.

**b) Cada línea país + región + NSE también es un techo.**
Al llegar a su objetivo se desactiva sola: no se le carga ni un lead más.

**c) Región sin cupo configurado = región cerrada.**
Antes una región sin configuración quedaba "abierta sin límite". Ahora no califica nadie
(así se cierran regiones fuera de muestra como El Salvador / Centro I).

**d) Nunca se presta cupo entre regiones.**
Un lead de Centro I no puede ocupar cupo de Centro II aunque aplique por condicional.

**e) Leads sin región identificada → "cuota agotada"** con un motivo propio, para poder
listarlos aparte.

**f) Panel de administración (`/admin/quotas`):** nueva tabla **"Estado de cuota por
región"** (objetivo / conseguido / disponible / **COMPLETA** / **CERRADA**) y aviso cuando
el objetivo manual no coincide con la suma de las líneas NSE. Cada línea NSE muestra
`COMPLETA` o `EXCEDIDA +N`.

**Sin cambios de base de datos.**

---

## 4. Mensaje final unificado (PUNTO 2)

A pedido del cliente, al completar las 4 fases el bot ahora envía siempre, en todos los
desarrollos:

> Gracias por tu interés y por el tiempo que has dedicado. 🙌
> 💬 Ten presente que más allá de que ya puedes cargar tus compras, serás contactado por
> nuestro equipo en el horario indicado anteriormente para terminar de validar las
> preguntas y ser parte de nuestro panel

---

## 5. Efecto esperado

- Las regiones y niveles que ya cumplieron cuota se apagan automáticamente.
- Se elimina la sobre-entrega y el gasto asociado.
- El equipo ve en el panel, en tiempo real, qué regiones están completas y cuáles siguen
  abiertas y bajo qué variables.
- Los 3 países apagados a mano se pueden volver a encender una vez cargados los objetivos
  por región.

## 6. Pendiente

- Cargar/confirmar en el panel el objetivo por región de cada país según la muestra del
  cliente.
- Decidir qué se hace con los ~149 leads ya entregados fuera de la solicitud (se quedan o
  se dan de baja manualmente).
- Validación end-to-end con un lead de prueba contra una región completa, en el deploy.
- Detalle en el panel de "cuota agotada" separando: sin región / región completa / región
  fuera de muestra.
