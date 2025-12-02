export default class MailService {
  /**
   * Enviar email usando SMTP compatible con Mailrelay y otros proveedores
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
    const smtpHost = process.env.SMTP_HOST || 'smtp1.s.ipzmarketing.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587')
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP_USER y SMTP_PASS deben estar definidos en las variables de entorno')
    }

    // Configurar el transporter de Nodemailer
    // Para Mailrelay: usar TLS (secure: false) con puerto 587
    // Para otros proveedores con puerto 465: usar SSL (secure: true)
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true para puerto 465 (SSL), false para 587 (TLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Opciones adicionales para compatibilidad con Mailrelay y otros proveedores
      ...(smtpPort === 587 && {
        requireTLS: true, // Forzar STARTTLS para puerto 587
      }),
    })

    // Limpiar el campo "from" para evitar errores de sintaxis
    // Algunos servidores SMTP (como Mailrelay) son estrictos con el formato
    const cleanFrom = from.trim()

    // Preparar el email
    const mailOptions = {
      from: cleanFrom,
      to: to,
      subject: subject,
      html: body,
      attachments: attachments.length > 0 ? attachments : undefined,
      // Especificar envelope explícitamente para mayor compatibilidad
      envelope: {
        from: cleanFrom.includes('<') ? cleanFrom.match(/<(.+)>/)?.[1] || cleanFrom : cleanFrom,
        to: to,
      },
    }

    // Enviar el email
    return transporter.sendMail(mailOptions)
  }
}
