import type { Exif } from 'sharp'
import {
  APERTURE_ALIASES,
  CAMERA_MAKE_ALIASES,
  CAMERA_MODEL_ALIASES,
  type ExifData,
  FOCAL_LENGTH_ALIASES,
  ISO_ALIASES,
  parseExifDateTakenMs,
  readExifAlias,
  readExifNumber,
} from './exif_fields.js'

const EXPOSURE_TIME_ALIASES = ['settings.exposureTime', 'exposureTime', 'ExposureTime']
const LENS_ALIASES = ['camera.lens', 'lens', 'LensModel']
const GPS_LAT_ALIASES = ['gps.lat', 'gps.latitude', 'gpsLatitude']
const GPS_LNG_ALIASES = ['gps.lng', 'gps.longitude', 'gpsLongitude']

/**
 * EXIF para el JPEG que se descarga. La main se guarda sin metadatos (el canvas
 * del navegador los quita), así que se reconstruyen desde descriptions.EXIF.
 * Devuelve null si no hay nada que escribir.
 */
export function buildDownloadExif(exif: ExifData): Exif | null {
  if (!exif) return null

  const ifd0: Record<string, string> = {}
  const exifIfd: Record<string, string> = {}
  const gpsIfd: Record<string, string> = {}

  const dateTaken = formatExifDate(exif.dateTaken)
  if (dateTaken) {
    exifIfd.DateTimeOriginal = dateTaken
    exifIfd.DateTimeDigitized = dateTaken
  }

  const { make, model } = readCamera(exif)
  if (make) ifd0.Make = make
  if (model) ifd0.Model = model

  const lens = readExifAlias(exif, LENS_ALIASES)
  if (lens !== null) exifIfd.LensModel = String(lens).trim()

  const aperture = readExifNumber(exif, APERTURE_ALIASES)
  if (aperture) exifIfd.FNumber = toRational(aperture)

  const focalLength = readExifNumber(exif, FOCAL_LENGTH_ALIASES)
  if (focalLength) exifIfd.FocalLength = toRational(focalLength)

  const exposureTime = readExifNumber(exif, EXPOSURE_TIME_ALIASES)
  if (exposureTime) exifIfd.ExposureTime = toExposureRational(exposureTime)

  const iso = readExifNumber(exif, ISO_ALIASES)
  if (iso) exifIfd.ISOSpeedRatings = String(Math.round(iso))

  // Solo GPS de la cámara: una ubicación inferida por IA no debe viajar como si fuera real.
  const lat = readCoordinate(exif, GPS_LAT_ALIASES)
  const lng = readCoordinate(exif, GPS_LNG_ALIASES)
  if (!exif.aiLocationInference && lat !== null && lng !== null && isValidCoordinate(lat, lng)) {
    gpsIfd.GPSLatitudeRef = lat >= 0 ? 'N' : 'S'
    gpsIfd.GPSLatitude = toDms(lat)
    gpsIfd.GPSLongitudeRef = lng >= 0 ? 'E' : 'W'
    gpsIfd.GPSLongitude = toDms(lng)
  }

  const result: Exif = {}
  if (Object.keys(ifd0).length) result.IFD0 = ifd0
  if (Object.keys(exifIfd).length) result.IFD2 = exifIfd
  if (Object.keys(gpsIfd).length) result.IFD3 = gpsIfd
  return Object.keys(result).length ? result : null
}

// Mismo convenio que el resto de la app: la fecha es un reloj de pared montado sobre UTC.
function formatExifDate(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const ms = parseExifDateTakenMs(raw)
  if (ms === null) return null

  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  )
}

/**
 * Las subidas guardan marca y modelo juntos en un solo texto ("Canon Canon EOS 90D",
 * "NIKON CORPORATION NIKON Z 6"). Si la primera palabra reaparece, ahí empieza el
 * modelo; si no, no hay forma segura de partirlo y todo va a Model.
 */
function readCamera(exif: NonNullable<ExifData>): { make: string | null; model: string | null } {
  const make = readExifAlias(exif, CAMERA_MAKE_ALIASES)
  const model = readExifAlias(exif, CAMERA_MODEL_ALIASES)
  if (model === null) return { make: make === null ? null : String(make).trim(), model: null }

  const modelText = String(model).trim().replace(/\s+/g, ' ')
  if (make !== null) return { make: String(make).trim(), model: modelText }

  const words = modelText.split(' ')
  const repeatAt = words.findIndex(
    (word, i) => i > 0 && word.toLowerCase() === words[0].toLowerCase()
  )
  if (repeatAt === -1) return { make: null, model: modelText }

  return { make: words.slice(0, repeatAt).join(' '), model: words.slice(repeatAt).join(' ') }
}

function toRational(value: number): string {
  let scale = 1
  while (scale < 10000 && Math.abs(value * scale - Math.round(value * scale)) > 1e-6) scale *= 10
  return `${Math.round(value * scale)}/${scale}`
}

// 1/250 se escribe como 1/250, pero 0.3 s es 3/10 y no 1/3.
function toExposureRational(seconds: number): string {
  const inverse = 1 / seconds
  const isUnitFraction = seconds < 1 && Math.abs(inverse - Math.round(inverse)) < 0.01 * inverse
  return isUnitFraction ? `1/${Math.round(inverse)}` : toRational(seconds)
}

function readCoordinate(exif: NonNullable<ExifData>, aliases: string[]): number | null {
  const raw = readExifAlias(exif, aliases)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function toDms(decimal: number): string {
  const hundredthsOfSecond = Math.round(Math.abs(decimal) * 360000)
  const degrees = Math.floor(hundredthsOfSecond / 360000)
  const minutes = Math.floor((hundredthsOfSecond % 360000) / 6000)
  const seconds = hundredthsOfSecond % 6000
  return `${degrees}/1 ${minutes}/1 ${seconds}/100`
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
}
