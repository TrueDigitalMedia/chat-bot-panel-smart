# Contract: Chat Room Registry

**Module**: `src/lib/web/chat-rooms.ts` · **Consumers**: `src/app/chat/[room]/page.tsx`,
`src/app/api/chat/web/route.ts`, `src/app/admin/rooms/page.tsx`

## Exports

```ts
export const CHAT_ROOMS: { readonly ecuador: 'Ecuador'; readonly mexico: 'México' }
export type ChatRoomSlug = 'ecuador' | 'mexico'

export function resolveRoom(slug: string): string | null
export function roomUrl(country: string): string
export function listRooms(): { country: string; slug: ChatRoomSlug; url: string }[]
```

## Behavior

| Function | Input | Output |
|----------|-------|--------|
| `resolveRoom` | `'ecuador'`, `'Ecuador'`, `'ECUADOR'` | `'Ecuador'` |
| `resolveRoom` | `'mexico'`, `'méxico'`, `'Mexico'` | `'México'` |
| `resolveRoom` | `'guatemala'`, `'ecuadorr'`, `''`, `'../x'` | `null` |
| `roomUrl` | `'Ecuador'` | `'https://<APP_BASE_URL>/chat/ecuador'`, or `'/chat/ecuador'` if `APP_BASE_URL` unset |
| `roomUrl` | a non-room country (`'Guatemala'`) | throws / returns `''` — callers only pass room countries |
| `listRooms` | — | `[{ country:'Ecuador', slug:'ecuador', url }, { country:'México', slug:'mexico', url }]` |

## Rules

1. `resolveRoom` MUST NOT throw; unknown → `null`.
2. Slug matching MUST be case-insensitive and MUST NOT accept accented forms (`méxico` slug is invalid
   as a URL segment; the *input* `'méxico'` may be normalized, but the canonical slug is `mexico`).
3. The room set is **fixed** to Ecuador + México. Adding a CAM country here is a spec change, not a
   config tweak.
4. `resolveRoom` returning a country does not guarantee it is configured — the bootstrap handler
   additionally checks `getCountryConfig(country)` and degrades if absent (see
   `web-bootstrap-room-param.md`).

## Tests (`tests/unit/chat-rooms.test.ts`)

- the mapping table above (hits, misses, casing, accents, path-traversal strings)
- `roomUrl` with and without `APP_BASE_URL`
- `listRooms()` returns exactly the 2 rooms, URLs consistent with `roomUrl`
