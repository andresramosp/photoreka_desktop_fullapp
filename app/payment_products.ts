import Stripe from 'stripe'

export type PaymentProductType = 'photo_package' | 'credits'

interface PaymentProductBase {
  id: string
  type: PaymentProductType
  name: string
  priceEur: number
  currency: string
  description: string
  stripePriceId: string
  stripeProductId: string
  highlighted?: boolean
  sortOrder: number
  imageUrl: string | null
}

export interface PhotoPackage extends PaymentProductBase {
  type: 'photo_package'
  photos: number
  analyzedPhotos: number
  credits: number
}

export interface CreditStep extends PaymentProductBase {
  type: 'credits'
  credits: number
}

export type PaymentCatalogItem = PhotoPackage | CreditStep

export interface PaymentCatalog {
  photoPackages: PhotoPackage[]
  creditSteps: CreditStep[]
}

interface ParseOptions {
  requireActive?: boolean
  currency?: string
}

type StripeMetadata = Stripe.Metadata | null | undefined

export function parsePaymentCatalogItem(
  price: Stripe.Price,
  options: ParseOptions = {}
): PaymentCatalogItem {
  const product = getExpandedProduct(price)
  const metadata = mergeMetadata(product.metadata, price.metadata)
  const type = parsePaymentType(metadata)
  const currency = price.currency.toLowerCase()

  if (options.requireActive && (!price.active || !product.active)) {
    throw new Error(`Stripe price ${price.id} or product ${product.id} is not active`)
  }

  if (price.type !== 'one_time') {
    throw new Error(`Stripe price ${price.id} is not a one-time price`)
  }

  if (price.unit_amount === null) {
    throw new Error(`Stripe price ${price.id} must have unit_amount`)
  }

  if (options.currency && currency !== options.currency.toLowerCase()) {
    throw new Error(`Stripe price ${price.id} currency must be ${options.currency}`)
  }

  const base = {
    id: metadata.photoreka_id || price.lookup_key || price.id,
    type,
    name: product.name,
    priceEur: price.unit_amount / 100,
    currency,
    description: metadata.description || product.description || '',
    stripePriceId: price.id,
    stripeProductId: product.id,
    highlighted: parseBoolean(metadata.highlighted),
    sortOrder: parseOptionalInteger(metadata.sort_order, Number.MAX_SAFE_INTEGER),
    imageUrl: product.images[0] || null,
  }

  if (type === 'photo_package') {
    const photos = parseRequiredInteger(metadata.photos, 'photos')

    return {
      ...base,
      type,
      photos,
      analyzedPhotos: parseOptionalInteger(metadata.analyzed_photos, photos),
      credits: parseOptionalInteger(metadata.credits, 0),
    }
  }

  return {
    ...base,
    type,
    credits: parseRequiredInteger(metadata.credits, 'credits'),
  }
}

export function tryParsePaymentCatalogItem(
  price: Stripe.Price,
  options: ParseOptions = {}
): PaymentCatalogItem | null {
  try {
    return parsePaymentCatalogItem(price, options)
  } catch (error) {
    console.warn('[PaymentProducts] Skipping Stripe price:', price.id, (error as Error).message)
    return null
  }
}

function getExpandedProduct(price: Stripe.Price): Stripe.Product {
  const product = price.product

  if (typeof product === 'string' || 'deleted' in product) {
    throw new Error(`Stripe price ${price.id} must be retrieved with an expanded product`)
  }

  return product
}

function mergeMetadata(productMetadata: StripeMetadata, priceMetadata: StripeMetadata) {
  return {
    ...(productMetadata || {}),
    ...(priceMetadata || {}),
  }
}

function parsePaymentType(metadata: Record<string, string>): PaymentProductType {
  const type = metadata.photoreka_type

  if (type === 'photo_package' || type === 'credits') return type

  throw new Error('Missing or invalid Stripe metadata "photoreka_type"')
}

function parseRequiredInteger(value: string | undefined, key: string): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing Stripe metadata "${key}"`)
  }

  return parseInteger(value, key)
}

function parseOptionalInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback

  return parseInteger(value, 'metadata')
}

function parseInteger(value: string, key: string): number {
  const normalized = value.replaceAll('_', '')
  const parsed = Number(normalized)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Stripe metadata "${key}" must be a non-negative integer`)
  }

  return parsed
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined

  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase())
}