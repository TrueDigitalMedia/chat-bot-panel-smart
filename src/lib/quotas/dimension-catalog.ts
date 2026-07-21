/**
 * Pure quota-dimension catalog — NO database import, so client components can use it
 * directly (see specs/011-flexible-quota-matching/data-model.md for the catalogs).
 */

export const NSE_LEVELS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'] as const
export type NseLevel = (typeof NSE_LEVELS)[number]

export const AGE_BANDS = ['Hasta 34', '35 a 49', '50+'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const HOUSEHOLD_BANDS = ['1 a 2', '3 a 4', '5+'] as const
export type HouseholdBand = (typeof HOUSEHOLD_BANDS)[number]

export const DIMENSION_TYPES = ['nse', 'edad', 'integrantes'] as const
export type DimensionType = (typeof DIMENSION_TYPES)[number]
