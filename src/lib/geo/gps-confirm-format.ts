import type { PlaceProposal } from '@/lib/geo/reverse-geocode'

export function formatGpsConfirmText(proposal: PlaceProposal): string {
  const barrio = proposal.neighborhood?.trim() || 'No identificado'
  return (
    '📍 ¿Confirmas esta ubicación?\n\n' +
    `• País: ${proposal.country}\n` +
    `• Departamento/Provincia: ${proposal.stateProvince}\n` +
    `• Municipio/Cantón: ${proposal.municipality}\n` +
    `• Barrio: ${barrio}`
  )
}
