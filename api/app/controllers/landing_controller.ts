import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import MailService from '#services/mail_service'
import { waitingListConfirmationTemplate } from '../utils/email_templates.js'

// Validator para el payload de solicitud de acceso
const requestAccessValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    // reason: vine.string().minLength(10).maxLength(500),
    portfolioLink: vine.string().optional(),
    hasLargeCollection: vine.boolean(),
  })
)

export default class LandingController {
  private mailService = new MailService()
  /**
   * Manejar solicitudes de acceso desde la landing page
   */
  async waitingList({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(requestAccessValidator)

      // Crear el contenido del email
      const emailContent = `
        <h2>Nueva Solicitud de Acceso - Photoreka</h2>
        <p><strong>Email del usuario:</strong> ${payload.email}</p>
        <p><strong>Enlace del portafolio:</strong> ${payload.portfolioLink || 'No proporcionado'}</p>
        <p><strong>Tiene colección grande:</strong> ${payload.hasLargeCollection ? 'Sí' : 'No'}</p>
        <hr>
        <p><small>Solicitud recibida el ${new Date().toLocaleString('es-ES')}</small></p>
      `

      // Enviar ambos correos en paralelo
      await Promise.all([
        this.mailService.sendEmail({
          from: 'hello@photoreka.com',
          to: 'andreschennai@gmail.com',
          subject: `Nueva solicitud de acceso - ${payload.email}`,
          body: emailContent,
        }),
        this.mailService.sendEmail({
          from: 'hello@photoreka.com',
          to: payload.email,
          subject:
            'Welcome to Photoreka’s Waitlist – Get Ready to Transform Your Creative Workflow!',
          body: waitingListConfirmationTemplate(null),
        }),
      ])

      return response.status(200).json({
        message: 'Solicitud enviada correctamente. Te contactaremos pronto.',
        success: true,
      })
    } catch (error) {
      console.error('Error al procesar solicitud de acceso:', error)

      // Si es un error de validación
      if (error.messages) {
        return response.status(422).json({
          message: 'Datos de solicitud inválidos',
          errors: error.messages,
          success: false,
        })
      }

      // Error general
      return response.status(500).json({
        message: 'Error interno del servidor. Inténtalo más tarde.',
        success: false,
      })
    }
  }
}
