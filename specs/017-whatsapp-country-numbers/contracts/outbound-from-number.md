# Contract: Outbound FROM-Number Selection

Every outbound WhatsApp message for a lead is sent from the business number that lead is bound to
(`leads.whatsapp_phone_number_id`). Threaded as an explicit parameter through the single `graphSend`
choke point.

## Provider layer

### `graphMessagesUrl(phoneNumberId?: string): string`

```
https://graph.facebook.com/{version}/{phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID}/messages
```

- `phoneNumberId` given → use it.
- omitted / empty → use `env.WHATSAPP_PHONE_NUMBER_ID` (the shared CAM default) **and** the caller
  that resolved "no bound number" logs `whatsapp_from_fallback { lead_id, fell_back_to }`
  (FR-007). `requireMeta()` still runs.

### `graphSend(payload, phoneNumberId?): Promise<string | undefined>`

Passes `phoneNumberId` to `graphMessagesUrl`. `Authorization` header unchanged — one shared
`WHATSAPP_ACCESS_TOKEN` for all numbers on the shared WABA.

### `sendMetaText / sendMetaVideo / sendMetaKeyboard(channelUserId, …, fromPhoneNumberId?)`

New trailing optional arg, forwarded to `graphSend`. The `[whatsapp:meta:out]` logs gain a
`phone_number_id` field so every send records the number it left from (Principle II).

## Facade layer

### `whatsapp/send.ts` — `sendWhatsAppText / Video / Keyboard / TemplateOrKeyboard / TemplateOrText(channelUserId, …, fromPhoneNumberId?)`

New trailing optional arg, forwarded to the Meta provider functions. Twilio branch ignores it
(single `TWILIO_WHATSAPP_FROM`).

### `messaging/send.ts` — WhatsApp `switch` branches

Each `case 'whatsapp':` passes `to.whatsappPhoneNumberId` as `fromPhoneNumberId`:

```ts
case 'whatsapp':
  await whatsapp.sendWhatsAppText(to.channelUserId, outText, to.whatsappPhoneNumberId)
  break
```

`ChannelRecipient` carries `whatsappPhoneNumberId?`. When the recipient is a `Lead` (the common case,
including every background job), it is `lead.whatsappPhoneNumberId`.

## Callers / background jobs

| Caller | How it gets the from-number |
|---|---|
| webhook `after()` live reply (`routeMessage` → `messaging/send`) | `lead` is the recipient → `lead.whatsappPhoneNumberId` |
| `re-engage` job (`sendTemplateOrKeyboard`) | loads `lead`, passes it as recipient → bound number |
| `deliver-registration-code` (`sendText` / `sendTemplateOrKeyboard` / `sendTemplateOrText`) | passes `lead` (and the `otpRecipient` spread `{ ...lead, channelUserId: lead.phoneNumber }` — which **keeps** `whatsappPhoneNumberId`) |
| freeze / timeout senders | pass `lead` |
| admin manual reply | passes the lead-derived recipient |

**Rule**: no caller constructs a WhatsApp `ChannelRecipient` without `whatsappPhoneNumberId` when a
`Lead` is available. If one truly has only a `channelUserId` (none identified today), the send falls
back to the default number + logs.

## Guarantees

| # | Guarantee |
|---|---|
| G1 | A lead bound to the Ecuador number receives 100% of its messages from the Ecuador number — live and background alike (FR-006, SC-003). |
| G2 | A lead with `whatsapp_phone_number_id = NULL` (legacy / generic) sends from `env.WHATSAPP_PHONE_NUMBER_ID` — identical to today's behavior (FR-015). |
| G3 | No automatic failover to a different number when a send fails or a number is rate-limited — the send fails/retries as today (sending from another number would break Meta's same-number reply rule). |
| G4 | The `Authorization` token, app secret, and template inventory are shared and unchanged (FR-009, FR-010). |
| G5 | Telegram and web `messaging/send` branches are untouched. |

## Regression proof (FR-018 / SC-005)

The new `tests/regression/whatsapp/` golden-master drives `processWhatsAppInbound` with a mocked
`graphSend` that records `{ url, payload }`. Assertions:

- a fixture conversation with `phoneNumberId` = the CAM default (or absent) yields a transcript,
  question order, scoring, and template-call sequence byte-identical to the pre-feature snapshot;
- every recorded `url` contains the expected `phone_number_id` (CAM default for the CAM fixture;
  the EC id for the Ecuador fixture);
- the existing CAM **Telegram** golden-master stays green (shared `messaging/send.ts` /
  `survey-plan.ts`).
