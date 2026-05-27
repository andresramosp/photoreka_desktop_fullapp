import { HttpContext } from '@adonisjs/core/http'
import MailService from '#services/mail_service'
import vine from '@vinejs/vine'

const quotaRequestValidator = vine.compile(
  vine.object({
    photosRequested: vine.number().min(0).max(1000000),
    comments: vine.string().trim().maxLength(2000).optional(),
  })
)

export default class EmailController {
  private mailService = new MailService()

  /**
   * Send a quota increase request email to hello@photoreka.com
   */
  async sendQuotaRequest({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!

    const payload = await request.validateUsing(quotaRequestValidator)

    const userEmail = (user as any).email || 'unknown'
    const userName = (user as any).name || 'Unknown'

    const photosLabel =
      payload.photosRequested === 0 ? 'Other (see comments)' : `${payload.photosRequested} photos`

    const body = `
      <h2>Quota Increase Request</h2>
      <p><strong>User:</strong> ${userName} (${userEmail})</p>
      <p><strong>Photos requested:</strong> ${photosLabel}</p>
      ${
        payload.comments
          ? `<p><strong>Comments:</strong></p><blockquote style="border-left:4px solid #ccc;padding-left:12px;color:#555;">${payload.comments.replace(/\n/g, '<br>')}</blockquote>`
          : ''
      }
      <hr>
      <p style="color:#999;font-size:12px;">Sent from Photoreka Settings</p>
    `

    await this.mailService.sendEmail({
      from: 'Photoreka <hello@photoreka.com>',
      to: 'hello@photoreka.com',
      subject: `Quota Request from ${userName} — ${photosLabel}`,
      body,
    })

    return response.ok({ message: 'Request sent successfully' })
  }
}
