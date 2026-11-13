# Atribución de anuncios click-to-WhatsApp

## Por qué

Pagamos anuncios de Meta que mandan a la gente a escribirnos por WhatsApp, y no teníamos forma de
saber qué anuncio trajo a cada lead. El webhook **ya venía trayendo el dato** —Twilio como campos
`Referral*` del form, Meta Cloud API como `messages[].referral`— y lo tirábamos en el normalizador.

Sin eso no se puede responder nada de lo que importa para decidir dónde poner la plata: qué anuncio
trae leads que califican, qué ad set los trae más baratos, qué campaña solo trae volumen que después
se cae. Y es un dato que **no se puede reconstruir después**: si no se guarda en el toque en que
llega, se perdió.

## Qué hace

Cada lead que entra desde un anuncio queda unido a su anuncio, ad set y campaña en Meta.

`ad_source_id` es el ID del anuncio y es la clave del join con la jerarquía de Meta Ads;
`ad_ctwa_clid` es el click ID de click-to-WhatsApp, que es lo que cruza con los reportes de Ads.
Guardamos además el titular, el cuerpo y el creativo tal como los vio el lead, porque un anuncio se
edita y los reportes de Meta muestran la versión de hoy, no la que de hecho convirtió.

## Modelo

Siete columnas nuevas en `leads`, todas nullable (`ad_source_id`, `ad_source_type`, `ad_source_url`,
`ad_ctwa_clid`, `ad_headline`, `ad_body`, `ad_referred_at`), más el índice
`leads_ad_source_id_idx`, que es por donde agrupa el reporte "cuántos leads trajo este anuncio".

Los leads que no vienen de un anuncio —y todos los anteriores a la migración— quedan en `NULL`.

### Atribución de primer toque

`recordLeadAdReferral` filtra por `WHERE id = $lead AND ad_source_id IS NULL AND ad_ctwa_clid IS
NULL`: **el primer referral que llega gana y nunca se sobrescribe.**

Meta adjunta el referral solo al primer mensaje después de tocar el anuncio, así que en el caso
normal se escribe una vez y listo. Pero un lead que vuelve meses después por otro anuncio manda un
referral nuevo, y reescribirlo haría que el lead se contara contra la campaña equivocada —la que lo
recontactó, no la que lo consiguió. Es la misma regla que ya sigue `acquisition_source`.

Sin `sourceId` ni `ctwaClid` no se escribe nada: un titular suelto no sirve para atribuir.

### Dos destinos a propósito

- **`conversation_messages.meta.referral`**, en *cada* toque que lo traiga — bitácora cruda de lo que
  mandó el proveedor, para poder auditar después qué llegó realmente.
- **Las columnas `leads.ad_*`**, solo el primer toque — el dato sobre el que se reporta.

La llamada va dentro de un `try/catch` que solo loguea: **un fallo de atribución jamás puede frenar
la conversación del lead**, que es lo único irrecuperable. Si la columna no existe todavía o la base
tarda, se pierde la atribución de ese toque y la conversación sigue.

## Normalización

Las dos fuentes convergen en la misma interfaz `AdReferral`:

- **Twilio** — `extractTwilioReferral` lee los `Referral*` con `trim`; los vacíos quedan en
  `undefined`, porque Twilio manda la key igual aunque Meta no haya puesto valor.
- **Meta** — `extractMetaReferral` mapea `messages[].referral`, con `mediaUrl = image_url ??
  video_url` según si el creativo es imagen o video.

`compactReferral` está compartida entre las dos: descarta las keys `undefined` y devuelve
`undefined` si no sobrevivió ninguna, para que **"no hubo anuncio" no se vea como un referral
vacío** aguas abajo. Las dos fuentes tienen que decidir eso igual o el pipeline las trata distinto.

## Migración

`0039_lead_ad_referral.sql`, escrita a mano. Cada sentencia es idempotente y el archivo entero es
re-ejecutable, porque `migrate.ts` usa el migrator `neon-http`, que manda cada sentencia suelta por
HTTPS y **no abre transacción**: un fallo a mitad deja la base a medias.

> **Pendiente de aplicar.** Mientras la migración no corra contra Neon, el primer lead que llegue
> desde un anuncio dispara el `catch` con `column "ad_source_id" does not exist`: la conversación
> sigue normal, pero la atribución se pierde en silencio.

## Verificación

- `npx tsc --noEmit -p .` limpio.
- `npx vitest run src tests/unit` → 931/931 en 77 archivos.
- Tests nuevos: extracción de Twilio (incluido el descarte de vacíos), extracción de Meta (imagen y
  video), `adReferral` undefined sin campos `Referral*`, y en `handle-inbound` que guarda el referral
  en `meta` y sella el lead, que no llama a `recordLeadAdReferral` sin referral, y que `routeMessage`
  corre igual aunque la atribución falle.

## Fuera de alcance

El reporte en el panel. Esto deja el dato guardado y indexado; leerlo y cruzarlo con Meta Ads es otro
PR.
