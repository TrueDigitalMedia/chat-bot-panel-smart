# Textos y opciones de las 30 plantillas de WhatsApp

Solo contenido — nombre, cuerpo, botones y variables de cada plantilla. Para la mecánica de creación en Twilio (Content API, Approval Request, prerrequisitos, checklist) ver [`whatsapp-twilio-templates-task.md`](whatsapp-twilio-templates-task.md).

Botones de respuesta rápida usados en todas: título ≤ 20 caracteres (límite de Meta), `id` = payload exacto que ya reconoce el webhook — no cambiar.

---

## Categoría MARKETING — pool `phase1_reengage`

Botones (idénticos en las 9): **✅ Sí, continuar** (`id: reengage:continue`) · **❌ No, gracias** (`id: reengage:stop`)

| Nombre | Cuerpo |
|---|---|
| `phase1_reengage_a1_v1` | 👋 Hola, notamos que dejaste la inscripción a mitad de camino. ¿Te ayudamos a completarla? Los datos ya están guardados 💾 |
| `phase1_reengage_a1_v2` | ✨ ¿Dónde andabas? Te extrañamos 😊 Completa tu registro en PanelSmart y empieza a ganar 🎁 |
| `phase1_reengage_a1_v3` | 📱 Casi lo logras! Solo falta terminar tu perfil para acceder a premios exclusivos. ¿Continuamos? ⚡ |
| `phase1_reengage_a2_v1` | 💚 Todavía tienes tiempo de unirte a PanelSmart. Miles ganan premios compartiendo sus compras 🛍️ Completa ahora 👉 |
| `phase1_reengage_a2_v2` | 🎯 Última llamada: Tu registro está al 80%. Solo toma 2 minutos finalizarlo y acceder a recompensas 💰 |
| `phase1_reengage_a2_v3` | 🚀 Aún hay cupo para ti en PanelSmart! Termina tu perfil hoy y comienza a canjear puntos 🏆 |
| `phase1_reengage_a3_v1` | ⏰ Última oportunidad: Tu cupo en PanelSmart expira pronto. ¡Completa ahora! No te arrepentirás 💪 |
| `phase1_reengage_a3_v2` | 🔔 Recordatorio: Tu acceso a premios exclusivos vence en horas. Termina tu inscripción ya 👇 |
| `phase1_reengage_a3_v3` | ⚡ ¿Lo dejamos? Tu lugar en PanelSmart se está cerrando. Completa ahora y empieza a ganar 🎉 |

---

## Categoría MARKETING — pool `phase2_link_reminder`

Botones (idénticos en las 9): **✅ Sí, continuar** (`id: reengage:continue`) · **❌ No, gracias** (`id: reengage:stop`)

Las 9 llevan siempre estos dos links fijos al final del cuerpo (texto plano, no botón):
```
📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es
🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US
```

| Nombre | Cuerpo (sin los links, van al final — ver arriba) |
|---|---|
| `phase2_link_reminder_a1_v1` | 📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque. |
| `phase2_link_reminder_a1_v2` | 🎁 Estás a un paso de empezar a ganar premios — solo falta descargar la app. ¿Te ayudamos? |
| `phase2_link_reminder_a1_v3` | ✨ Tu cupo en PanelSmart ya está confirmado, solo falta la app para activarlo 🚀 |
| `phase2_link_reminder_a2_v1` | ⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇 |
| `phase2_link_reminder_a2_v2` | 💚 Miles de personas ya están ganando premios en PanelSmart compartiendo sus compras. Descarga la app y súmate 🛍️ |
| `phase2_link_reminder_a2_v3` | 🔔 Recordatorio: tu código de registro te espera. Descarga la app cuando puedas y te lo enviamos al instante ⚡ |
| `phase2_link_reminder_a3_v1` | ⏰ Última oportunidad: tu cupo en PanelSmart podría asignarse a otra persona si no descargas la app pronto. |
| `phase2_link_reminder_a3_v2` | ⚡ ¿Lo dejamos aquí? Descarga la app ahora y no pierdas tu lugar en PanelSmart. |
| `phase2_link_reminder_a3_v3` | 🚨 Este es nuestro último aviso: descarga la app para activar tu cupo antes de que se cierre. |

---

## Categoría MARKETING — pool `phase4_ficha_hogar`

Botones (idénticos en las 9): **✅ Sí, continuar** (`id: reengage:continue`) · **❌ No, gracias** (`id: reengage:stop`)

| Nombre | Cuerpo |
|---|---|
| `phase4_ficha_hogar_a1_v1` | 🏡 ¡Ya casi terminas! Solo faltan unas preguntas de tu Ficha Hogar para completar tu perfil en PanelSmart. |
| `phase4_ficha_hogar_a1_v2` | 📋 Notamos que dejaste tu Ficha Hogar a mitad de camino. ¿Seguimos? Son solo un par de preguntas más. |
| `phase4_ficha_hogar_a1_v3` | ✨ Un último paso para tu Ficha Hogar y quedas listo para empezar a ganar premios en PanelSmart 🎁 |
| `phase4_ficha_hogar_a2_v1` | 💚 Tu Ficha Hogar sigue incompleta — termínala en un par de minutos y no te pierdas tus premios. |
| `phase4_ficha_hogar_a2_v2` | 🎯 Estás muy cerca: solo faltan algunas preguntas de tu Ficha Hogar para activar tu cupo por completo. |
| `phase4_ficha_hogar_a2_v3` | 🚀 Completa tu Ficha Hogar hoy y empieza a disfrutar de todos los beneficios de PanelSmart. |
| `phase4_ficha_hogar_a3_v1` | ⏰ Último aviso: completa tu Ficha Hogar pronto o podrías perder tu lugar en el panel. |
| `phase4_ficha_hogar_a3_v2` | 🔔 Recordatorio final: tu Ficha Hogar quedó a medias. Termínala ahora para no perder tu cupo. |
| `phase4_ficha_hogar_a3_v3` | ⚡ ¿Seguimos? Tu Ficha Hogar está casi lista — solo falta este último paso. |

---

## Categoría UTILITY — código de registro

| Nombre | Cuerpo | Botones | Variables |
|---|---|---|---|
| `registration_instructions` | 📋 Estos son los pasos para registrarte en la app; tu código de registro va justo a continuación 👇<br><br>1️⃣ Abre la app e ingresa a «¿Ha olvidado su contraseña?».<br>2️⃣ Escribe tu código de usuario y pulsa «entregar».<br>3️⃣ Escribe los últimos 4 dígitos de tu celular (el mismo que colocaste para contactarte).<br>4️⃣ Recibirás un código por mensaje de texto a tu número de celular; escríbelo para terminar la verificación.<br><br>Si tienes cualquier duda durante el registro, escríbeme y te ayudo. | — | ninguna |
| `registration_code_confirm` | ✅ Tu código de registro es: {{1}}<br><br>Cuando hayas "activado" la app con ese código, confirma aquí: | **✅ Ya me registré** (`id: register:yes`) · **❌ No registré aún** (`id: register:no`) | `{{1}}` = código de registro |
| `registration_delayed_redirect` | Tu código de registro está tardando más de lo esperado en llegar. No te preocupes, nuestro equipo se pondrá en contacto contigo para ayudarte a completar tu registro. | — | ninguna |

---

## Verificación de longitud de botones (límite de Meta: 20 caracteres)

| Botón | Título | Longitud |
|---|---|---|
| `reengage:continue` | ✅ Sí, continuar | 15 ✓ |
| `reengage:stop` | ❌ No, gracias | 13 ✓ |
| `register:yes` | ✅ Ya me registré | 16 ✓ |
| `register:no` | ❌ No registré aún | 17 ✓ |
