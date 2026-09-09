import { SURVEY_FIELDS, type SurveyFieldName } from '@/types/lead'
import { resolveSurveyQuestions } from './survey-plan'

export const FIELD_LABELS: Record<SurveyFieldName, string> = {
  fullName: 'Nombre',
  country: 'País',
  stateProvince: 'Departamento / provincia',
  municipality: 'Municipio',
  neighborhood: 'Zona / barrio',
  email: 'Email',
  gender: 'Género',
  educationPsh: 'Educación PSH',
  cars: 'Autos',
  domesticHelp: 'Empleada doméstica',
  householdSize: 'Personas en el hogar',
  bedrooms: 'Habitaciones',
  shoppingFrequency: 'Frecuencia de compra',
  shoppingCategories: 'Categorías de compra',
  contactChannel: 'Canal de contacto',
  contactSchedule: 'Horario de contacto',
  age: 'Edad',
  isPregnant: 'Embarazo',
  hasBabyUnder3: 'Bebé menor de 3 años',
}

/** Synonyms → survey field (for NL correction). */
export const FIELD_ALIASES: Record<string, SurveyFieldName> = {
  nombre: 'fullName',
  apellido: 'fullName',
  'nombre y apellido': 'fullName',
  pais: 'country',
  país: 'country',
  country: 'country',
  departamento: 'stateProvince',
  depto: 'stateProvince',
  provincia: 'stateProvince',
  estado: 'stateProvince',
  municipio: 'municipality',
  canton: 'municipality',
  cantón: 'municipality',
  barrio: 'neighborhood',
  zona: 'neighborhood',
  colonia: 'neighborhood',
  aldea: 'neighborhood',
  parroquia: 'neighborhood',
  distrito: 'neighborhood',
  email: 'email',
  correo: 'email',
  mail: 'email',
  'e-mail': 'email',
  genero: 'gender',
  género: 'gender',
  educacion: 'educationPsh',
  educación: 'educationPsh',
  psh: 'educationPsh',
  autos: 'cars',
  carros: 'cars',
  'empleada domestica': 'domesticHelp',
  'empleada doméstica': 'domesticHelp',
  personas: 'householdSize',
  hogar: 'householdSize',
  habitaciones: 'bedrooms',
  cuartos: 'bedrooms',
  frecuencia: 'shoppingFrequency',
  categorias: 'shoppingCategories',
  categorías: 'shoppingCategories',
  canal: 'contactChannel',
  horario: 'contactSchedule',
  edad: 'age',
  años: 'age',
  embarazo: 'isPregnant',
  embarazada: 'isPregnant',
  bebe: 'hasBabyUnder3',
  bebé: 'hasBabyUnder3',
}

export function resolveFieldAlias(raw: string): SurveyFieldName | null {
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()

  if ((SURVEY_FIELDS as readonly string[]).includes(raw as SurveyFieldName)) {
    return raw as SurveyFieldName
  }

  // Prefer longer aliases first to avoid partial false matches
  const aliases = Object.entries(FIELD_ALIASES).sort((a, b) => b[0].length - a[0].length)
  for (const [alias, field] of aliases) {
    const a = alias
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    if (key === a || key === field.toLowerCase()) return field
  }
  for (const [alias, field] of aliases) {
    const a = alias
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    if (key.includes(a) && a.length >= 4) return field
  }
  return null
}

/** Fields cleared when a parent geo field changes. */
export function cascadeClearFields(field: SurveyFieldName): SurveyFieldName[] {
  if (field === 'country') return ['stateProvince', 'municipality', 'neighborhood']
  if (field === 'stateProvince') return ['municipality', 'neighborhood']
  if (field === 'municipality') return ['neighborhood']
  return []
}

/**
 * Position of `field` in the survey resolved for `country` (1-based). Country-aware
 * since 014 — Ecuador's NSE variables aren't in the fixed CAM `SURVEY_FIELDS` order.
 * Falls back to the CAM order when `country` is omitted (back-compat for callers that
 * haven't threaded a country through yet) or when `field` isn't in the resolved list.
 */
export function questionIndexForField(
  field: SurveyFieldName | string,
  country?: string | null,
): number {
  const resolved = resolveSurveyQuestions(country ?? null)
  const idx = resolved.findIndex((q) => q.fieldName === field)
  if (idx >= 0) return idx + 1
  return SURVEY_FIELDS.indexOf(field as SurveyFieldName) + 1
}

export const CORRECT_MENU = 'correct:menu'
export const CORRECT_CANCEL = 'correct:cancel'
