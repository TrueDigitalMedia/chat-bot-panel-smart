import { sendInlineKeyboard } from '@/lib/messaging/send'
import type { GeoField } from '@/lib/geo/guatemala'
import { geoConfirmPrompt } from '@/lib/geo/guatemala'
import type { ChannelRecipient } from '@/types/channel'

export const GEO_YES_PREFIX = 'geo:yes:'
export const GEO_NO_PREFIX = 'geo:no:'

export function isGeoConfirmCallback(data: string | undefined): boolean {
  return !!data && (data.startsWith(GEO_YES_PREFIX) || data.startsWith(GEO_NO_PREFIX))
}

export function encodeGeoConfirmYes(field: GeoField, canonical: string): string {
  return `${GEO_YES_PREFIX}${field}:${encodeURIComponent(canonical)}`
}

export function encodeGeoConfirmNo(field: GeoField): string {
  return `${GEO_NO_PREFIX}${field}`
}

export function parseGeoConfirmYes(
  data: string,
): { field: GeoField; canonical: string } | null {
  if (!data.startsWith(GEO_YES_PREFIX)) return null
  const rest = data.slice(GEO_YES_PREFIX.length)
  const idx = rest.indexOf(':')
  if (idx < 0) return null
  const field = rest.slice(0, idx) as GeoField
  const canonical = decodeURIComponent(rest.slice(idx + 1))
  if (!field || !canonical) return null
  return { field, canonical }
}

export function parseGeoConfirmNo(data: string): GeoField | null {
  if (!data.startsWith(GEO_NO_PREFIX)) return null
  return data.slice(GEO_NO_PREFIX.length) as GeoField
}

export async function askGeoConfirmation(
  to: ChannelRecipient,
  field: GeoField,
  canonical: string,
): Promise<void> {
  await sendInlineKeyboard(to, geoConfirmPrompt(canonical), [
    [
      { text: `Sí, ${canonical}`, callback_data: encodeGeoConfirmYes(field, canonical) },
      { text: 'No, corregir', callback_data: encodeGeoConfirmNo(field) },
    ],
  ])
}
