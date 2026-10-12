import vine from '@vinejs/vine'

/**
 * Validates the user registration payload
 */
export const createAuthValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(2).maxLength(50),
    email: vine.string().email().toLowerCase(),
    password: vine
      .string()
      .minLength(8)
      .maxLength(100)
      .regex(/[!@#$%^&*(),.?":{}|<>\[\]\\/_\-+=~`]/),
    inviteCode: vine.string().minLength(6).maxLength(20).optional(),
    usageTier: vine.enum(['BASIC', 'PRO', 'PREMIUM']).optional(),
    preferredSource: vine.enum(['web', 'lightroom']).optional(),
  })
)

/**
 * Validates the user login payload
 */
export const createLoginValidator = vine.compile(
  vine.object({
    email: vine.string().email().toLowerCase(),
    password: vine.string().minLength(1),
  })
)

/**
 * Validates the password change payload
 */
export const changePasswordValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(1),
    newPassword: vine
      .string()
      .minLength(8)
      .maxLength(100)
      .regex(/[!@#$%^&*(),.?":{}|<>\[\]\\/_\-+=~`]/),
  })
)

/**
 * Validates the profile update payload
 */
export const updateProfileValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(2).maxLength(50).optional(),
    email: vine.string().email().toLowerCase().optional(),
    preferredSource: vine.enum(['web', 'lightroom']).optional(),
    profiles: vine.string().optional(),
  })
)

/**
 * Validates the email confirmation payload
 */
export const confirmEmailValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(20).maxLength(100),
  })
)

/**
 * Validates the forgot password request payload
 */
export const forgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().email().toLowerCase(),
  })
)

/**
 * Validates the password reset payload
 */
export const resetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(20).maxLength(100),
    newPassword: vine
      .string()
      .minLength(8)
      .maxLength(100)
      .regex(/[!@#$%^&*(),.?":{}|<>\[\]\\/_\-+=~`]/),
  })
)

/**
 * Validates the resend confirmation email payload
 */
export const resendConfirmationValidator = vine.compile(
  vine.object({
    email: vine.string().email().toLowerCase(),
  })
)
