export const MINIMUM_PANELIST_AGE = 18

/** Minors don't qualify as panelists — checked both on first answer (phase-1.ts) and
 *  when a user later corrects their age (correction.ts), which persist independently. */
export function isMinorAge(age: number): boolean {
  return age < MINIMUM_PANELIST_AGE
}
