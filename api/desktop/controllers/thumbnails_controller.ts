import type { HttpContext } from '@adonisjs/core/http'
import fs from 'node:fs/promises'
import db from '@adonisjs/lucid/services/db'
import {
  MAX_THUMB_BYTES,
  imageMimeType,
  isThumbKey,
  isValidThumbSignature,
  readLocalThumb,
  writeLocalThumb,
} from '../thumbnails.js'

export default class ThumbnailsController {
  /**
   * La miniatura para un <img> de la web desktop. Si aún no está en el disco (fotos importadas
   * antes de guardar copia local), redirige a R2.
   */
  async file({ params, request, response }: HttpContext) {
    const key = `desktop/thumbs/${params.userId}/${params.file}`
    if (!isThumbKey(key) || !isValidThumbSignature(key, request.qs().s)) {
      return response.forbidden({ message: 'Invalid signature' })
    }
    const data = await readLocalThumb(key)
    if (data) {
      // La clave es única y su contenido no cambia nunca.
      response.header('Cache-Control', 'private, max-age=31536000, immutable')
      response.header('Content-Type', imageMimeType(data) ?? 'application/octet-stream')
      return response.send(data)
    }
    response.header('Cache-Control', 'no-store')
    return response.redirect(`https://${process.env.IMAGES_WORKER}/${key}`)
  }

  /** Al importar: la web desktop manda la miniatura que acaba de subir a R2 para guardar la copia local. */
  async store({ auth, params, request, response }: HttpContext) {
    const userId = auth.use('api').user!.id
    // db.from y no Photo.query(): el modelo oculta las fotos sin confirmar, que son justo estas.
    const photo = await db
      .from('photos')
      .where('id', Number(params.id))
      .where('user_id', userId)
      .whereNull('deleted_at')
      .select('thumbnail_name')
      .first()
    if (!photo || !isThumbKey(photo.thumbnail_name)) return response.notFound({ message: 'Photo not found' })

    const upload = request.file('thumbnail', { size: MAX_THUMB_BYTES })
    if (!upload?.tmpPath || !upload.isValid) return response.badRequest({ message: 'Miniatura inválida' })
    const data = await fs.readFile(upload.tmpPath)
    if (!imageMimeType(data)) return response.badRequest({ message: 'Miniatura inválida' })

    await writeLocalThumb(photo.thumbnail_name, data)
    return response.ok({ stored: true })
  }
}
