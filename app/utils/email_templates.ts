/**
 * Email templates for Photoreka authentication emails
 */

const LOGO_URL = 'https://www.photoreka.com/logos/marca/horizontal-claim-dark.png'
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
              <img src="${LOGO_URL}" alt="Photoreka" style="height: 75px; width: auto;" />
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
        <td align="center" style="padding: 0 0;">
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
      Your email has been confirmed and your Photoreka account is ready! Start uploading your photos and let our engine help you curate your catalog.
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

/**
 * Waiting list confirmation email
 */
export function waitingListConfirmationTemplate(userName: string | null): string {
  const content = `
<h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
You're on the Waiting List
</h1>
<p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
${userName ? `Hi ${userName},` : 'Hi there,'}
</p>
<p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
Thanks for your interest in Photoreka. We've added you to our waiting list.
Access is being rolled out gradually in small batches of <strong style="color: ${TEXT_COLOR};">20 users</strong>,
so we can ensure a smooth and high-quality experience for everyone.
</p>


<div style="background-color: rgba(99, 102, 241, 0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
<p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
You'll receive an email as soon as your batch is ready.
There's nothing else you need to do for now.
</p>
</div>


<p style="margin: 30px 0 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
In the meantime, you can follow Photoreka's progress or simply sit back
and wait. We appreciate your patience and interest.
</p>


${emailButton('Visit Photoreka', 'https://www.photoreka.com')}


<hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />


<p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
This email confirms your subscription to the Photoreka waiting list.
If you didn't request this, you can safely ignore this message.
</p>
`

  return baseLayout(content, 'Photoreka waiting list confirmation')
}

// Subject: Your Photoreka access is ready

// Hi,

// Good news. Your batch is now open and you can start using Photoreka.

// You now have access to Photoreka on the **Free plan**, which includes space for up to **1,000 photos**. This should be enough to explore the core workflow, organize your library, and see how the platform fits into your photography process.

// If at some point you need to manage a larger collection, you’ll be able to upgrade your plan directly from your account. There’s no obligation to do so, and you can stay on the free plan for as long as it works for you.

// You can get started here:
// [https://www.photoreka.com](https://www.photoreka.com)

// Thanks for your patience while waiting for access. We’re rolling things out gradually to make sure everything runs smoothly, and we’re happy to have you in this batch.

// Welcome to Photoreka.
/**
 * Invitation email template
 */
export function inviteUserTemplate(
  inviterName: string,
  _inviteCode: string,
  registerUrl: string,
  photosAllowance: number = 500
): string {
  const formattedPhotos = photosAllowance.toLocaleString()
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      You're Invited to Photoreka
    </h1>

    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi there,
    </p>

    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      <strong style="color: ${TEXT_COLOR};">${inviterName}</strong> invited you to join Photoreka — 
      a Photo Management and Curation platform built for photographers who truly care about their archive.
    </p>

    ${emailButton('Join Photoreka', registerUrl)}

    <p style="margin: -20px 0 20px 0; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      <a href="https://www.photoreka.com/demo" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-weight: 500;">
        ▶️ Or try the demo first
      </a>
    </p>

    <div style="background-color: rgba(99, 102, 241, 0.05); border-radius: 8px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0 0 15px; font-size: 14px; color: ${TEXT_COLOR}; font-weight: 600; text-align: center;">
        What you can do inside Photoreka:
      </p>
      <p style="margin: 0 0 10px; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: left; line-height: 1.6;">
        • <strong style="color: ${TEXT_COLOR};">Natural Language Search:</strong> Find any photo by describing what’s happening in it<br/>
        • <strong style="color: ${TEXT_COLOR};">2D & 3D Map:</strong> Navigate your archive as a universe of proximity clusters<br/>
        • <strong style="color: ${TEXT_COLOR};">Interactive Canvas:</strong> Visually arrange and reorder images to build narratives<br/>
        • <strong style="color: ${TEXT_COLOR};">Aesthetic Ranking:</strong> Sort your archive by visual impact<br/>
        • <strong style="color: ${TEXT_COLOR};">Series Creation:</strong> Let photos connect and form coherent bodies of work
      </p>
    </div>

    <div style="background-color: rgba(16, 185, 129, 0.06); border-radius: 8px; padding: 18px; margin: 20px 0; border: 1px solid rgba(16, 185, 129, 0.15);">
      <p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_COLOR}; font-weight: 600; text-align: center;">
        🚀 Founding Phase Access
      </p>
      <p style="margin: 0 0 10px; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
        This invitation includes a complimentary package of 
        <strong style="color: ${TEXT_COLOR};">${formattedPhotos} photos processed free of charge</strong>, 
        so you can fully explore your archive and experience the platform.
      </p>
      <p style="margin: 0 0 10px; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
        Photoreka is currently in its early phase, with a limited group of photographers shaping its evolution. 
        We’re continuously refining the experience — your feedback directly influences what comes next.
      </p>
      <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
        During this phase, usage is complimentary. As the platform matures, structured subscription plans with usage tiers will be introduced. 
        Early members will retain preferential access.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />
    
    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>

    <p style="margin: 10px 0 0; font-size: 12px; color: ${PRIMARY_COLOR}; text-align: center; word-break: break-all;">
      ${registerUrl}
    </p>
  `

  return baseLayout(content, "You're invited to Photoreka")
}

// Early access email (plain style, low-promo, user requested access)

export function grantUserTemplate(
  inviterName: string,
  _inviteCode: string,
  registerUrl: string,
  photosAllowance: number = 500
): string {
  const formattedPhotos = photosAllowance.toLocaleString()
  const content = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                font-size: 15px; 
                line-height: 1.7; 
                color: ${TEXT_COLOR};">

      <p style="margin: 0 0 16px;">
        Hi,
      </p>

      <p style="margin: 0 0 16px;">
        Thanks for requesting early access to Photoreka.
      </p>

      <p style="margin: 0 0 16px;">
        You can now create your account using the link below:
      </p>

      <p style="margin: 0 0 20px; word-break: break-all;">
        <a href="${registerUrl}" style="color: ${PRIMARY_COLOR}; text-decoration: none;">
          ${registerUrl}
        </a>
      </p>

      <p style="margin: 0 0 16px;">
        During this early phase, you can upload and process up to 
        <strong>${formattedPhotos} photos free of charge</strong> to explore the platform and work with your archive.
      </p>

      <p style="margin: 0 0 16px;">
        Photoreka is still evolving. You may notice small rough edges, but your catalog and edits are meant to stay with you as the platform matures.
      </p>

      <p style="margin: 0 0 16px;">
        If anything feels unclear, unstable, or especially useful, just reply to this email. 
        Your feedback directly shapes what we improve next.
      </p>

      <p style="margin: 24px 0 0;">
        — ${inviterName}
      </p>

      <p style="margin: 4px 0 0; font-size: 13px; color: ${MUTED_TEXT_COLOR};">
        Photoreka
      </p>

    </div>
  `

  return baseLayout(content, 'Your Photoreka early access')
}

/**
 * Referral reward notification — sent to the inviter when their friend registers
 */
export function inviteReferralRewardTemplate(
  inviterName: string,
  inviteeName: string,
  bonusCredits: number,
  bonusPhotos: number
): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Your friend just joined Photoreka!
    </h1>

    <p style="margin: 0 0 20px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Hi <strong style="color: ${TEXT_COLOR};">${inviterName}</strong>,
    </p>

    <p style="margin: 0 0 24px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      <strong style="color: ${TEXT_COLOR};">${inviteeName}</strong> just signed up using your invitation — thanks for spreading the word!
    </p>

    <div style="background-color: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 16px; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">Referral rewards added to your account</p>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding: 0 12px;">
            <p style="margin: 0; font-size: 32px; font-weight: 700; color: ${PRIMARY_COLOR};">+${bonusCredits.toLocaleString()}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: ${MUTED_TEXT_COLOR};">credits</p>
          </td>
          <td style="text-align: center; padding: 0 12px;">
            <p style="margin: 0; font-size: 32px; font-weight: 700; color: #22c55e;">+${bonusPhotos.toLocaleString()}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: ${MUTED_TEXT_COLOR};">analysis photos</p>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 0; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Credits are used for AI-powered features like semantic search, ChatLab, and photo analysis.
      Keep sharing Photoreka and earn more every time a friend joins.
    </p>
  `

  return baseLayout(content, 'You earned referral credits on Photoreka')
}

/**
 * Tier definition for analysis completion email
 */
interface PhotoTier {
  range: string
  minPhotos: number
  profile: string
  color: string
  features: { label: string; icon: string; status: 'ok' | 'maybe' | 'no' }[]
}

const TIERS: PhotoTier[] = [
  {
    range: '< 100',
    minPhotos: 0,
    profile: 'Casual single-photo use',
    color: 'rgba(239, 68, 68, 0.25)',
    features: [
      { label: 'Framer', icon: '🖼️', status: 'ok' },
      { label: 'Semantic Search', icon: '🔍', status: 'maybe' },
      { label: 'Series & Collections', icon: '📁', status: 'no' },
      { label: 'Portfolios', icon: '🗂️', status: 'no' },
      { label: 'Canvas', icon: '🎨', status: 'maybe' },
      { label: '2D/3D Atlas', icon: '🗺️', status: 'no' },
      { label: 'Patterns & Report', icon: '📊', status: 'no' },
      { label: 'ChatLab AI', icon: '🤖', status: 'maybe' },
    ],
  },
  {
    range: '100 – 1,000',
    minPhotos: 100,
    profile: 'Catalog subset exploration',
    color: 'rgba(245, 158, 11, 0.25)',
    features: [
      { label: 'Framer', icon: '🖼️', status: 'ok' },
      { label: 'Semantic Search', icon: '🔍', status: 'ok' },
      { label: 'Series & Collections', icon: '📁', status: 'maybe' },
      { label: 'Portfolios', icon: '🗂️', status: 'maybe' },
      { label: 'Canvas', icon: '🎨', status: 'ok' },
      { label: '2D/3D Atlas', icon: '🗺️', status: 'maybe' },
      { label: 'Patterns & Report', icon: '📊', status: 'maybe' },
      { label: 'ChatLab AI', icon: '🤖', status: 'ok' },
    ],
  },
  {
    range: '1,000 – 5,000',
    minPhotos: 1000,
    profile: 'Meaningful collection work',
    color: 'rgba(6, 182, 212, 0.25)',
    features: [
      { label: 'Framer', icon: '🖼️', status: 'ok' },
      { label: 'Semantic Search', icon: '🔍', status: 'ok' },
      { label: 'Series & Collections', icon: '📁', status: 'ok' },
      { label: 'Portfolios', icon: '🗂️', status: 'ok' },
      { label: 'Canvas', icon: '🎨', status: 'ok' },
      { label: '2D/3D Atlas', icon: '🗺️', status: 'maybe' },
      { label: 'Patterns & Report', icon: '📊', status: 'maybe' },
      { label: 'ChatLab AI', icon: '🤖', status: 'ok' },
    ],
  },
  {
    range: '5,000 – 20,000',
    minPhotos: 5000,
    profile: 'Deep archive analysis',
    color: 'rgba(34, 197, 94, 0.25)',
    features: [
      { label: 'Framer', icon: '🖼️', status: 'ok' },
      { label: 'Semantic Search', icon: '🔍', status: 'ok' },
      { label: 'Series & Collections', icon: '📁', status: 'ok' },
      { label: 'Portfolios', icon: '🗂️', status: 'ok' },
      { label: 'Canvas', icon: '🎨', status: 'ok' },
      { label: '2D/3D Atlas', icon: '🗺️', status: 'ok' },
      { label: 'Patterns & Report', icon: '📊', status: 'ok' },
      { label: 'ChatLab AI', icon: '🤖', status: 'ok' },
    ],
  },
]

function getTier(totalPhotos: number): PhotoTier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalPhotos >= TIERS[i].minPhotos) return TIERS[i]
  }
  return TIERS[0]
}

function getNextTier(totalPhotos: number): PhotoTier | null {
  for (const tier of TIERS) {
    if (totalPhotos < tier.minPhotos) return tier
  }
  return null
}

function featureStatusColor(status: 'ok' | 'maybe' | 'no'): string {
  if (status === 'ok') return '#22c55e'
  if (status === 'maybe') return '#f59e0b'
  return '#ef4444'
}

function featureStatusBg(status: 'ok' | 'maybe' | 'no'): string {
  if (status === 'ok') return 'rgba(34, 197, 94, 0.15)'
  if (status === 'maybe') return 'rgba(245, 158, 11, 0.15)'
  return 'rgba(239, 68, 68, 0.15)'
}

function featureStatusSymbol(status: 'ok' | 'maybe' | 'no'): string {
  if (status === 'ok') return '✓'
  if (status === 'maybe') return '?'
  return '✗'
}

/**
 * Analysis completed notification email
 */
export function analysisCompleteTemplate(
  userName: string,
  processedPhotos: number,
  failedPhotos: number,
  totalUserPhotos: number,
  processUrl: string
): string {
  const tier = getTier(totalUserPhotos)
  const nextTier = getNextTier(totalUserPhotos)
  const allSucceeded = failedPhotos === 0

  const featuresHtml = tier.features
    .map(
      (f) => `
      <tr>
        <td style="padding: 8px 12px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          ${f.icon} ${f.label}
        </td>
        <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; border-radius: 50%; 
                       font-size: 13px; font-weight: 700; text-align: center;
                       background: ${featureStatusBg(f.status)}; color: ${featureStatusColor(f.status)};">
            ${featureStatusSymbol(f.status)}
          </span>
        </td>
      </tr>`
    )
    .join('')
  const summaryItems = [
    `<strong style="color: ${TEXT_COLOR};">${processedPhotos}</strong> photo${processedPhotos !== 1 ? 's' : ''} processed`,
    ...(failedPhotos > 0
      ? [
          `<strong style="color: #ef4444;">${failedPhotos}</strong> photo${failedPhotos !== 1 ? 's' : ''} failed`,
        ]
      : []),
    `<strong style="color: ${TEXT_COLOR};">${totalUserPhotos.toLocaleString()}</strong> total in your archive`,
  ]

  const nextTierSection = nextTier
    ? `
    <div style="background-color: rgba(99, 102, 241, 0.08); border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid rgba(99, 102, 241, 0.15);">
      <p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_COLOR}; font-weight: 600; text-align: center;">
        🚀 Unlock more with your next milestone
      </p>
      <p style="margin: 0; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
        Upload more photos to reach the <strong style="color: ${TEXT_COLOR};">${nextTier.range}</strong> tier
        (<em>${nextTier.profile}</em>) and get full access to more tools.
        The more photos you import, the more powerful every feature becomes.
      </p>
    </div>`
    : `
    <div style="background-color: rgba(34, 197, 94, 0.08); border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid rgba(34, 197, 94, 0.15);">
      <p style="margin: 0; font-size: 14px; color: #22c55e; font-weight: 600; text-align: center;">
        🎉 You've reached the top tier — all tools are fully unlocked!
      </p>
    </div>`

  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Analysis Complete ${allSucceeded ? '✅' : '⚠️'}
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Your photo analysis has finished. Here's a quick summary:
    </p>

    <!-- Summary -->
    <div style="background-color: rgba(99, 102, 241, 0.05); border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.8;">
        ${summaryItems.join(' &nbsp;·&nbsp; ')}
      </p>
    </div>

    <!-- Current tier badge -->
    <p style="margin: 0 0 6px; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">
      Your current tier
    </p>
    <p style="margin: 0 0 20px; text-align: center;">
      <span style="display: inline-block; padding: 6px 18px; border-radius: 8px; font-size: 14px; font-weight: 600;
                   background: ${tier.color}; color: ${TEXT_COLOR};">
        ${tier.range} photos — ${tier.profile}
      </span>
    </p>

    <!-- Features table -->
    <table role="presentation" style="width: 100%; max-width: 400px; margin: 0 auto 20px; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: ${MUTED_TEXT_COLOR}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            Feature
          </th>
          <th style="padding: 8px 12px; text-align: center; font-size: 11px; color: ${MUTED_TEXT_COLOR}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        ${featuresHtml}
      </tbody>
    </table>

    <!-- Legend -->
    <p style="margin: 0 0 20px; font-size: 11px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      <span style="color: #22c55e;">✓</span> Works great &nbsp;&nbsp;
      <span style="color: #f59e0b;">?</span> Limited value &nbsp;&nbsp;
      <span style="color: #ef4444;">✗</span> Not useful yet
    </p>

    ${nextTierSection}

    ${emailButton('View Your Processes', processUrl)}

    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />

    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      This is an automated notification from Photoreka. Your photos are ready to explore.
    </p>
  `

  return baseLayout(content, 'Analysis Complete - Photoreka')
}

export function aiLocationInferenceCompleteTemplate(
  userName: string,
  stats: {
    total: number
    located: number
    unknown: number
    uncertain: number
    geocodeMiss: number
    failed: number
    creditsCharged: number
    costEur: number
    mapUrl: string
  }
): string {
  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Location analysis complete
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 22px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      Photoreka finished trying to infer locations for your photos without GPS metadata.
    </p>

    <div style="background-color: rgba(99, 102, 241, 0.08); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">${stats.located}</strong> placed on the map
      </p>
      <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">${stats.unknown}</strong> no visual evidence
      </p>
      ${
        stats.uncertain > 0
          ? `<p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">${stats.uncertain}</strong> low confidence, not geocoded
      </p>`
          : ''
      }
      ${
        stats.geocodeMiss > 0
          ? `<p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: ${TEXT_COLOR};">${stats.geocodeMiss}</strong> geocoding returned no results
      </p>`
          : ''
      }
      ${
        stats.failed > 0
          ? `<p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        <strong style="color: #ef4444;">${stats.failed}</strong> processing error
      </p>`
          : ''
      }
      <p style="margin: 0; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        Credits charged: <strong style="color: ${TEXT_COLOR};">${stats.creditsCharged}</strong> 
      </p>
    </div>

    ${emailButton('Open World Map', stats.mapUrl)}
  `

  return baseLayout(content, 'Location analysis complete - Photoreka')
}

/**
 * Portfolio review build complete notification email
 */
export function reportReviewBuildTemplate(
  userName: string,
  params: {
    isRebuild: boolean
    photosAdded: number
    photosRemoved: number
    totalPhotos: number
    patternsByType: Record<string, { title: string; strength: string; isNew?: boolean }[]>
    totalCostInEur: number
    portfolioUrl: string
  }
): string {
  const { isRebuild, photosAdded, photosRemoved, totalPhotos, patternsByType, portfolioUrl } =
    params

  const totalPatterns = Object.values(patternsByType).reduce((sum, arr) => sum + arr.length, 0)

  // Changes summary
  const changeItems: string[] = []
  if (photosAdded > 0) {
    changeItems.push(
      `<strong style="color: #22c55e;">+${photosAdded}</strong> photo${photosAdded !== 1 ? 's' : ''} added`
    )
  }
  if (photosRemoved > 0) {
    changeItems.push(
      `<strong style="color: #ef4444;">−${photosRemoved}</strong> photo${photosRemoved !== 1 ? 's' : ''} removed`
    )
  }
  changeItems.push(
    `<strong style="color: ${TEXT_COLOR};">${totalPhotos.toLocaleString()}</strong> total in archive`
  )

  // Patterns table by review type
  const reviewTypeLabels: Record<string, { label: string; icon: string }> = {
    general: { label: 'Visual Patterns', icon: '🎨' },
    story: { label: 'Narrative Themes', icon: '📖' },
    context: { label: 'Contextual Patterns', icon: '🌍' },
  }

  function strengthBadge(strength: string): string {
    const colors: Record<string, { bg: string; text: string }> = {
      strong: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
      moderate: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
      emergent: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' },
    }
    const c = colors[strength] || colors.emergent
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${c.bg}; color: ${c.text};">${strength}</span>`
  }

  let patternsHtml = ''
  for (const [type, patterns] of Object.entries(patternsByType)) {
    const meta = reviewTypeLabels[type] || { label: type, icon: '📋' }
    if (patterns.length === 0) continue

    const rows = patterns
      .map(
        (p) => `
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; color: ${MUTED_TEXT_COLOR}; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          ${p.title}
        </td>
        <td style="padding: 6px 12px; text-align: center; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          ${strengthBadge(p.strength)}
        </td>
        <td style="padding: 6px 12px; text-align: center; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          ${p.isNew ? '<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(99, 102, 241, 0.15); color: #818cf8;">new</span>' : ''}
        </td>
      </tr>`
      )
      .join('')

    patternsHtml += `
    <div style="margin: 16px 0 0;">
      <p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_COLOR}; font-weight: 600;">
        ${meta.icon} ${meta.label} <span style="font-weight: 400; color: ${MUTED_TEXT_COLOR};">(${patterns.length})</span>
      </p>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`
  }

  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Portfolio Review ${isRebuild ? 'Updated' : 'Ready'} 📊
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      ${isRebuild ? 'Your usage patterns have been updated with new changes in your archive.' : "Your portfolio review is ready. Here's what we found across your archive."}
    </p>

    <!-- Changes summary -->
    <div style="background-color: rgba(99, 102, 241, 0.05); border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.8;">
        ${changeItems.join(' &nbsp;·&nbsp; ')}
      </p>
    </div>

    <!-- Patterns overview -->
    <div style="background-color: rgba(99, 102, 241, 0.08); border-radius: 8px; padding: 20px; margin: 0 0 20px; border: 1px solid rgba(99, 102, 241, 0.15);">
      <p style="margin: 0 0 4px; font-size: 22px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
        ${totalPatterns}
      </p>
      <p style="margin: 0; font-size: 13px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
        pattern${totalPatterns !== 1 ? 's' : ''} identified across your portfolio
      </p>
    </div>

    ${patternsHtml}

    <!-- Legend -->
    <p style="margin: 16px 0 24px; font-size: 11px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      <span style="color: #22c55e;">strong</span> &nbsp;&nbsp;
      <span style="color: #f59e0b;">moderate</span> &nbsp;&nbsp;
      <span style="color: #94a3b8;">emergent</span>
    </p>

    ${emailButton('View Portfolio Review', portfolioUrl)}

    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />

    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      This is an automated notification from Photoreka.
    </p>
  `

  return baseLayout(content, 'Portfolio Review - Photoreka')
}

/**
 * Portfolio build complete notification email
 */
export function portfolioBuildCompleteTemplate(
  userName: string,
  params: {
    photoCount: number
    targetSize: number
    recallSize: number
    costEur: number
    portfolioUrl: string
    hasSequencing: boolean
  }
): string {
  const { photoCount, recallSize, portfolioUrl, hasSequencing } = params

  const content = `
    <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">
      Your Portfolio is Ready 📸
    </h1>
    <p style="margin: 0 0 10px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: ${MUTED_TEXT_COLOR}; text-align: center; line-height: 1.6;">
      We've reviewed <strong style="color: ${TEXT_COLOR};">${recallSize}</strong> candidate photos from your catalog and curated a selection of <strong style="color: ${TEXT_COLOR};">${photoCount}</strong> for your portfolio.
    </p>



    ${
      hasSequencing
        ? `<p style="margin: 0 0 24px; font-size: 14px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
            ✨ Your portfolio includes a <strong style="color: ${TEXT_COLOR};">suggested viewing sequence</strong> for optimal flow.
          </p>`
        : ''
    }

    ${emailButton('View Your Portfolio', portfolioUrl)}

    <hr style="border: none; border-top: 1px solid rgba(148, 163, 184, 0.2); margin: 30px 0;" />

    <p style="margin: 0; font-size: 12px; color: ${MUTED_TEXT_COLOR}; text-align: center;">
      This is an automated notification from Photoreka.
    </p>
  `

  return baseLayout(content, 'Portfolio Ready - Photoreka')
}
