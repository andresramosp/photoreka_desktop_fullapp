/**
 * Email templates for Photoreka authentication emails
 */

const LOGO_URL = 'https://www.photoreka.com/assets/logo_name_white-BR4h4RBP.png'
const PRIMARY_COLOR = '#6366f1' // Indigo
const SECONDARY_COLOR = '#4f46e5'
const BACKGROUND_COLOR = '#0f172a' // Dark slate
const CARD_BACKGROUND = '#1e293b'
const TEXT_COLOR = '#f8fafc'
const MUTED_TEXT_COLOR = '#94a3b8'

/**
 * Base layout wrapper for all email templates
 */
function baseLayout(content: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${BACKGROUND_COLOR}; color: ${TEXT_COLOR};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 30px 0;">
              <img src="${LOGO_URL}" alt="Photoreka" style="height: 50px; width: auto;" />
            </td>
          </tr>
          <!-- Main Content Card -->
          <tr>
            <td style="background-color: ${CARD_BACKGROUND}; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 30px 0;">
              <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR};">
                © ${new Date().getFullYear()} Photoreka. All rights reserved.
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: ${MUTED_TEXT_COLOR};">
                AI-Powered Photo Organization & Discovery
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Button component for emails
 */
function emailButton(text: string, url: string): string {
  return `
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 30px 0;">
          <a href="${url}" 
             style="display: inline-block; 
                    padding: 16px 40px; 
                    background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${SECONDARY_COLOR} 100%);
                    color: #ffffff; 
                    text-decoration: none; 
                    font-weight: 600; 
                    font-size: 16px; 
                    border-radius: 8px;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
                    transition: all 0.3s ease;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `
}

/**
 * Email confirmation template
 */
export function emailConfirmationTemplate(userName: string, confirmationUrl: string): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Welcome to Photoreka! 🎉
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Thank you for joining Photoreka! To complete your registration and start organizing your photos with AI, please confirm your email address.
    </p>
    
    ${emailButton('Confirm Email', confirmationUrl)}
    
    <div style="background-color: rgba(99, 102, 241, 0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">🔒 Security Note:</strong><br/>
        This link will expire in 24 hours. If you didn't create an account with Photoreka, you can safely ignore this email.
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />
    
    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin: 10px 0 0; font-size: 12px; color: ${PRIMARY_COLOR}; text-align: center; word-break: break-all;">
      ${confirmationUrl}
    </p>
  `

  return baseLayout(content, 'Confirm your email - Photoreka')
}

/**
 * Password reset request template
 */
export function passwordResetTemplate(userName: string, resetUrl: string): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Password Reset Request 🔐
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      We received a request to reset your password. Click the button below to create a new password for your Photoreka account.
    </p>
    
    ${emailButton('Reset Password', resetUrl)}
    
    <div style="background-color: rgba(239, 68, 68, 0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: #ef4444;">⚠️ Important:</strong><br/>
        This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />
    
    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin: 10px 0 0; font-size: 12px; color: ${PRIMARY_COLOR}; text-align: center; word-break: break-all;">
      ${resetUrl}
    </p>
  `

  return baseLayout(content, 'Reset your password - Photoreka')
}

/**
 * Password changed confirmation template
 */
export function passwordChangedTemplate(userName: string): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Password Changed Successfully ✅
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Your password has been successfully changed. You can now use your new password to log in to your Photoreka account.
    </p>
    
    <div style="background-color: rgba(34, 197, 94, 0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: #22c55e;">🛡️ Security Notice:</strong><br/>
        If you didn't make this change, please contact our support team immediately and secure your account.
      </p>
    </div>
    
    ${emailButton('Go to Photoreka', 'https://www.photoreka.com')}
  `

  return baseLayout(content, 'Password changed - Photoreka')
}

/**
 * Welcome email after email confirmation
 */
export function welcomeEmailTemplate(userName: string): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      You're All Set! 🚀
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Your email has been confirmed and your Photoreka account is ready! Start uploading your photos and let our AI help you organize, discover, and create amazing collections.
    </p>
    

    
    ${emailButton('Start Exploring', 'https://www.photoreka.com/')}
  `

  return baseLayout(content, 'Welcome to Photoreka!')
}

/**
 * Resend confirmation email template
 */
export function resendConfirmationTemplate(userName: string, confirmationUrl: string): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Confirm Your Email 📧
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      You requested a new confirmation email. Click the button below to verify your email address and activate your Photoreka account.
    </p>
    
    ${emailButton('Confirm Email', confirmationUrl)}
    
    <div style="background-color: rgba(99, 102, 241, 0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">🔒 Security Note:</strong><br/>
        This link will expire in 24 hours.
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />
    
    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin: 10px 0 0; font-size: 12px; color: ${PRIMARY_COLOR}; text-align: center; word-break: break-all;">
      ${confirmationUrl}
    </p>
  `

  return baseLayout(content, 'Confirm your email - Photoreka')
}
