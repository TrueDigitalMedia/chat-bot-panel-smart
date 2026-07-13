export type PlaceProposal = {
  country: string
  stateProvince: string
  municipality: string
  neighborhood: string | null
}

type NominatimAddress = {
  country?: string
  country_code?: string
  state?: string
  region?: string
  county?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  city_district?: string
  suburb?: string
  neighbourhood?: string
  quarter?: string
}

type NominatimResponse = {
  address?: NominatimAddress
  error?: string
}

/**
 * Reverse-geocode lat/lng via Nominatim. Coordinates are NOT persisted by callers.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<PlaceProposal | null> {
  const base =
    process.env.NOMINATIM_BASE_URL?.replace(/\/$/, '') ||
    'https://nominatim.openstreetmap.org'
  const url = new URL(`${base}/reverse`)
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'es')

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'PanelSmartRecruitmentBot/1.0 (nse-geo-quota; contact: panelsmart)',
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    console.warn('[reverse-geocode] http error', { status: res.status })
    return null
  }

  const data = (await res.json()) as NominatimResponse
  if (!data.address) {
    console.warn('[reverse-geocode] no address', { error: data.error })
    return null
  }

  const a = data.address
  const country = a.country?.trim()
  const stateProvince = (a.state || a.region || a.county || '').trim()
  const municipality = (
    a.municipality ||
    a.city ||
    a.town ||
    a.village ||
    a.city_district ||
    ''
  ).trim()
  const neighborhood =
    (a.suburb || a.neighbourhood || a.quarter || '').trim() || null

  if (!country || !stateProvince || !municipality) {
    console.warn('[reverse-geocode] incomplete admin', {
      country: country || null,
      stateProvince: stateProvince || null,
      municipality: municipality || null,
    })
    return null
  }

  return { country, stateProvince, municipality, neighborhood }
}
