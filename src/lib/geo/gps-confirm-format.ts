import type { PlaceProposal } from '@/lib/geo/reverse-geocode'

export function formatGpsConfirmText(proposal: PlaceProposal): string {
  // Barrio/neighborhood is captured internally but never shown to the user (Q5 is
  // hidden from the survey entirely — see gps-capture.ts's applyAllowlistAfterConfirm).
  return (
    '📍 ¿Confirmas esta ubicación?\n\n' +
    `• País: ${proposal.country}\n` +
    `• Departamento/Provincia: ${proposal.stateProvince}\n` +
    `• Municipio/Cantón: ${proposal.municipality}`
  )
}
