/**
 * PAQUETES DE PAGO — Definición centralizada
 *
 * Este archivo define todos los productos de pago disponibles:
 * 1) Paquetes de fotos (incluyen créditos)
 * 2) Hitos del slider de créditos sueltos
 *
 * Los precios se leen SIEMPRE del backend. El frontend solo envía el ID del paquete o step.
 */

// ─── Paquetes de fotos ────────────────────────────────────────────────────────

export interface PhotoPackage {
  id: string
  name: string
  photos: number
  analyzedPhotos: number
  credits: number
  priceEur: number
  /** Stripe Price ID — se rellena tras crear los productos en Stripe */
  stripePriceId: string | null
  highlighted?: boolean
}

export const photoPackages: PhotoPackage[] = [
  {
    id: 'starter',
    name: '+500 Analysis',
    photos: 500,
    analyzedPhotos: 500,
    credits: 1_000,
    priceEur: 4.99,
    stripePriceId: null,
  },
  {
    id: 'explorer',
    name: '+1K Analysis',
    photos: 1_000,
    analyzedPhotos: 1_000,
    credits: 2_500,
    priceEur: 8.99,
    stripePriceId: null,
    highlighted: true,
  },
  {
    id: 'creator',
    name: '+2.5K Analysis',
    photos: 2_500,
    analyzedPhotos: 2_500,
    credits: 7_500,
    priceEur: 19.99,
    stripePriceId: null,
  },
  {
    id: 'studio',
    name: '+5K Analysis',
    photos: 5_000,
    analyzedPhotos: 5_000,
    credits: 18_000,
    priceEur: 34.99,
    stripePriceId: null,
  },
  // {
  //   id: 'unlimited',
  //   name: 'Unlimited',
  //   photos: 15_000,
  //   analyzedPhotos: 15_000,
  //   credits: 60_000,
  //   priceEur: 89.99,
  //   stripePriceId: null,
  // },
]

// ─── Slider de créditos ───────────────────────────────────────────────────────

export interface CreditStep {
  id: string
  credits: number
  priceEur: number
  description: string
  /** Stripe Price ID — se rellena tras crear los productos en Stripe */
  stripePriceId: string | null
}

export const creditSteps: CreditStep[] = [
  {
    id: 'credits_500',
    credits: 500,
    priceEur: 0.49,
    description: '~1 week of light chat usage',
    stripePriceId: null,
  },
  {
    id: 'credits_1500',
    credits: 1_500,
    priceEur: 1.49,
    description: '~1 month of moderate chat & search',
    stripePriceId: null,
  },
  {
    id: 'credits_5000',
    credits: 5_000,
    priceEur: 4.49,
    description: '~3 months of regular usage',
    stripePriceId: null,
  },
  {
    id: 'credits_15000',
    credits: 15_000,
    priceEur: 12.99,
    description: '~6 months of intensive usage',
    stripePriceId: null,
  },
  {
    id: 'credits_50000',
    credits: 50_000,
    priceEur: 39.99,
    description: '~1 year of heavy usage + GPU search',
    stripePriceId: null,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPhotoPackage(id: string): PhotoPackage | undefined {
  return photoPackages.find((p) => p.id === id)
}

export function getCreditStep(id: string): CreditStep | undefined {
  return creditSteps.find((s) => s.id === id)
}
