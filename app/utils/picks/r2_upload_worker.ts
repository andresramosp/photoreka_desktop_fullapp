import crypto from 'node:crypto'

// Same signing contract as CatalogController and GeoRecoveryController (copied there
// on purpose to leave production paths untouched); new code shares this one.

const UPLOAD_URL_TTL_SECONDS = 60 * 15

function normalizeBase(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`
}

/** Signed PUT URL for the upload worker, or null when the worker is not configured. */
export function buildUploadWorkerUrl(key: string, contentType: string): string | null {
  const secret = process.env.R2_UPLOAD_WORKER_SECRET
  const baseUrl = normalizeBase(process.env.R2_UPLOAD_WORKER_URL || process.env.IMAGES_WORKER)
  if (!secret || !baseUrl) return null

  const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${key}\n${contentType}\n${expiresAt}`)
    .digest('hex')

  const url = new URL(`/upload/${encodeURIComponent(key)}`, `${baseUrl}/`)
  url.searchParams.set('contentType', contentType)
  url.searchParams.set('expires', String(expiresAt))
  url.searchParams.set('signature', signature)
  return url.toString()
}

/** Public URL of an R2 object served by the images worker. */
export function imagesWorkerUrl(key: string): string | null {
  const base = normalizeBase(process.env.IMAGES_WORKER)
  return base ? `${base}/${key}` : null
}
