import { SURVEY_FIELDS, type SurveyFieldName } from '@/types/lead'

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

export function questionIndexForField(field: SurveyFieldName): number {
  return SURVEY_FIELDS.indexOf(field) + 1
}

export const CORRECT_MENU = 'correct:menu'
export const CORRECT_CANCEL = 'correct:cancel'
