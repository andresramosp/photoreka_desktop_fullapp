import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

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
  /**
   * Enviar email usando SMTP de GoDaddy (reutilizable, compatible con adjuntos)
   */
  async sendEmail({
    from,
    to,
    subject,
    body,
    attachments = [],
  }: {
    from: string
    to: string
    subject: string
    body: string
    attachments?: any[]
  }) {
    const nodemailer = await import('nodemailer')

    // Validar que las variables de entorno estén configuradas
    const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net'
    const smtpPort = parseInt(process.env.SMTP_PORT || '465')
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP_USER y SMTP_PASS deben estar definidos en las variables de entorno')
    }

    // Configurar el transporter de Nodemailer
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true para puerto 465, false para otros puertos
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    // Preparar el email
    const mailOptions = {
      from: from,
      to: to,
      subject: subject,
      html: body,
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    // Enviar el email
    return transporter.sendMail(mailOptions)
  }
  /**
   * Manejar solicitudes de acceso desde la landing page
   */
  async request({ request, response }: HttpContext) {
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

      // Usar el método reutilizable para enviar el email
      await this.sendEmail({
        from: 'hello@photoreka.com',
        to: 'andreschennai@gmail.com',
        subject: `Nueva solicitud de acceso - ${payload.email}`,
        body: emailContent,
      })

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
