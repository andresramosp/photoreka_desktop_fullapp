// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — la vía de los bytes: ¿son estas dos el MISMO archivo?
//
// Segunda ruta hacia el modo `duplicate`, para las parejas a las que el EXIF no
// puede decirles nada. La ruta normal exige `dateTaken` en las dos fotos, así que
// un catálogo de capturas de pantalla, escaneos o imágenes reexportadas sin
// metadatos se queda fuera por completo: la misma imagen subida dos veces cae en
// `default` y conserva hasta un punto de diferencia entre barras sin que nada lo
// justifique.
//
// Aquí la prueba son los bytes de la miniatura, que es evidencia MÁS fuerte que la
// tríada de la ruta normal (dhash + hora + histograma) junta: si dos objetos tienen
// el mismo contenido, no queda nada que pudiera justificar puntuarlos distinto, y
// de paso el histograma sobra porque es igual por construcción.
//
// ── Por qué el ETag y no descargar la miniatura ──────────────
//
// R2 devuelve en el `HeadObject` el MD5 del contenido, así que la comparación de
// bytes ya viene hecha y sin transferir ni uno. Un HEAD por foto y a comparar
// cadenas. Si algún día el ETag dejara de servir, este módulo es el único sitio
// que habría que tocar: cambiar la huella por un sha256 del cuerpo descargado no
// afecta a nadie más.
//
// ── Qué NO prueba ────────────────────────────────────────────
//
// La miniatura la genera el CLIENTE y se sube firmada (ver `catalog_controller`,
// que solo acuña las claves), así que sus bytes dependen del codificador de quien
// subió. La misma imagen entrada desde la web y desde el plugin de Lightroom da
// miniaturas distintas. Es decir: esto tiene falsos NEGATIVOS y ni un falso
// positivo, que es justo la asimetría que queremos — la vía solo añade duplicados
// que hoy se pierden y no puede romper ninguno de los que ya funcionan.
// ══════════════════════════════════════════════════════════════

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import pLimit from 'p-limit'

/** Peticiones simultáneas a R2. Son HEAD: pesan latencia, no ancho de banda. */
const CONCURRENCY = 10
const TIMEOUT_MS = 8000

/**
 * Por debajo de esto no hay miniatura que valga, y sí puede haber restos de una
 * subida que se cortó. Sin este corte, dos objetos vacíos compartirían huella y
 * pasarían por el mismo archivo: el único falso positivo que esta vía admitiría.
 */
const MIN_TRUSTED_BYTES = 1024

/** Una foto y la clave de su miniatura en el bucket. */
export interface ThumbRef {
  id: number
  key: string
}

let cachedClient: S3Client | null | undefined

/**
 * Cliente de R2, o `null` si el entorno no lo tiene configurado. Que falte no es un
 * error: la vía entera se apaga sola y el motor sigue como antes de existir.
 */
function r2Client(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) {
    cachedClient = null
    return null
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  })
  return cachedClient
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout tras ${timeoutMs} ms`)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  }) as Promise<T>
}

/**
 * Huella de un objeto: tamaño y MD5, juntos. El tamaño no añade seguridad —el MD5
 * ya la da— pero hace la cadena legible en un log y separa de golpe los ETags
 * multiparte, que llevan sufijo `-N` y solo casan con otro subido igual.
 */
export function thumbFingerprint(
  bytes: number | undefined,
  etag: string | undefined
): string | null {
  if (!bytes || bytes < MIN_TRUSTED_BYTES) return null

  const normalized = etag?.replace(/"/g, '').trim()
  if (!normalized) return null

  return `${bytes}:${normalized}`
}

/**
 * Huella de cada miniatura, saltándose las que R2 no sepa resolver. Una foto que
 * falte en el mapa simplemente no opina: nunca se empareja con nadie.
 *
 * Los fallos se tragan a propósito. Esto corre dentro de un trabajo por lotes que
 * puede estar recalculando un catálogo entero, y que R2 tarde de más en una foto no
 * puede tumbar la ejecución: como mucho esa pareja se queda en `default`, que es
 * exactamente donde estaría si esta vía no existiera.
 */
export async function fetchThumbFingerprints(refs: ThumbRef[]): Promise<Map<number, string>> {
  const fingerprints = new Map<number, string>()

  const client = r2Client()
  if (!client || refs.length === 0) return fingerprints

  const bucket = process.env.R2_BUCKET!
  const limit = pLimit(CONCURRENCY)

  await Promise.all(
    refs.map((ref) =>
      limit(async () => {
        try {
          const head = await withTimeout(
            client.send(new HeadObjectCommand({ Bucket: bucket, Key: ref.key })),
            TIMEOUT_MS
          )
          const value = thumbFingerprint(head.ContentLength, head.ETag)
          if (value) fingerprints.set(ref.id, value)
        } catch {
          // Objeto ausente, credenciales caducadas o R2 lento: no opina.
        }
      })
    )
  )

  return fingerprints
}
