# Data Model: WhatsApp via Twilio Messaging Provider

**Feature**: `003-whatsapp-twilio-provider`  
**Date**: 2026-07-13

---

## Entity: Lead (existing — no migration required for core identity)

| Field | Usage for WhatsApp |
|-------|--------------------|
| `channel` | `'whatsapp'` |
| `channel_user_id` | E.164 phone (`+502…`) without `whatsapp:` prefix |
| `phone_number` | Auto-set from `channel_user_id` when missing |
| `channel_username` | Optional; usually null on WA |

Unique key remains `(channel, channel_user_id)`.

---

## Entity: FlowState (extension — optional for button fallback)

| Field | Type | Description |
|-------|------|-------------|
| `pendingWaChoices` | JSONB NULLABLE | Map of user reply token → `callback_data` for numbered/quick-reply fallback, e.g. `{ "1": "d1:accept", "2": "d1:decline", "confirmo y acepto": "d1:accept" }` |

Clear after a matching inbound choice is consumed.

**Migration**: `0008_wa_pending_choices.sql` adding `pending_wa_choices JSONB` to `flow_states` (only if numbered fallback needs persistence — recommended for V1).

---

## Entity: ConversationMessage (existing)

Log inbound/outbound with `channel=whatsapp`. Store Twilio `MessageSid` in `meta` when available.

---

## Entity: TwilioInboundEvent (ephemeral — not persisted as table)

Normalized fields before `ChannelInbound`:

| Field | Source |
|-------|--------|
| fromPhone | `From` minus `whatsapp:` |
| body | `Body` |
| messageSid | `MessageSid` |
| latitude / longitude | `Latitude` / `Longitude` if present |
| buttonPayload | Interactive reply payload if present |

---

## Relationships

```text
Twilio webhook → normalize → upsertLead(whatsapp, phone)
                           → routeMessage(lead, ChannelInbound)
Telegram webhook → (unchanged) upsertLead(telegram, chatId)
```
