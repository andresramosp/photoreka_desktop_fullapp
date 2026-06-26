import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Current Terms of Service / content-policy version.
 * Bump this string whenever the legal terms change so new acceptances are
 * recorded against the right version.
 */
export const CURRENT_TOS_VERSION = '2026-06-25'

/**
 * Extract the best-effort client IP from a request (honours the proxy header).
 */
export function getClientIp(request: HttpContext['request']): string | null {
  return request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || null
}

/**
 * Build the ToS acceptance fields to persist on a user at account creation.
 * Centralizes version + timestamp + IP so every signup path records it identically.
 */
export function buildTosAcceptance(request: HttpContext['request']) {
  return {
    tosAcceptedVersion: CURRENT_TOS_VERSION,
    tosAcceptedAt: DateTime.now(),
    tosAcceptedIp: getClientIp(request),
  }
}
