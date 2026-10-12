import { HttpContext } from '@adonisjs/core/http'
import { requestMoreQuota } from '#desktop/cloud_functions'
import vine from '@vinejs/vine'

const quotaRequestValidator = vine.compile(
  vine.object({
    photosRequested: vine.number().min(0).max(1000000),
    comments: vine.string().trim().maxLength(2000).optional(),
  })
)

/** Escritorio: el correo lo envía la nube, que tiene el SMTP. */
export default class EmailController {
  /**
   * Send a quota increase request email to hello@photoreka.com
   */
  async sendQuotaRequest({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!

    const payload = await request.validateUsing(quotaRequestValidator)

    await requestMoreQuota(user.id, payload)
    return response.ok({ message: 'Request sent successfully' })
  }
}
