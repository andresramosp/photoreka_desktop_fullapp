import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import redis from '@adonisjs/redis/services/main'
import llmRateLimitConfig from '#config/llm_rate_limit'

/**
 * Middleware de rate limiting específico para endpoints que hacen llamadas a LLM
 *
 * Protecciones implementadas:
 * - Límite por minuto (burst protection)
 * - Límite por hora (abuse prevention)
 * - Límite por día (cuota diaria)
 * - Tracking dual: por usuario autenticado + por IP
 * - Headers informativos de rate limit
 * - Cooldown automático tras exceder límites
 * - Whitelist para IPs y usuarios privilegiados
 * - Estrategias de fallo configurables
 */
export default class LlmRateLimitMiddleware {
  async handle({ request, response, auth }: HttpContext, next: NextFn) {
    // Si el middleware está deshabilitado, continuar
    if (!llmRateLimitConfig.enabled) {
      await next()
      return
    }

    try {
      // Identificadores para tracking
      const ip = request.ip()
      const userId = auth.user?.id?.toString() || 'anonymous'
      const identifier = `${userId}:${ip}`

      // Verificar whitelist
      if (this.isWhitelisted(userId, ip)) {
        if (llmRateLimitConfig.logLevel === 'all') {
          console.log(`[LLM Rate Limit] Usuario/IP en whitelist: ${identifier}`)
        }
        await next()
        return
      }

      // Verificar si está en cooldown
      const cooldownKey = `llm_rate_limit:cooldown:${identifier}`
      const isInCooldown = await redis.get(cooldownKey)

      if (isInCooldown) {
        const ttl = await redis.ttl(cooldownKey)
        return response.tooManyRequests({
          error: 'Rate limit exceeded',
          message: `Demasiadas solicitudes. Espera ${ttl} segundos antes de reintentar.`,
          retryAfter: ttl,
          type: 'cooldown',
        })
      }

      // Claves para diferentes ventanas de tiempo
      const minuteKey = `llm_rate_limit:minute:${identifier}:${this.getCurrentMinute()}`
      const hourKey = `llm_rate_limit:hour:${identifier}:${this.getCurrentHour()}`
      const dayKey = `llm_rate_limit:day:${identifier}:${this.getCurrentDay()}`

      // Obtener contadores actuales
      const [minuteCount, hourCount, dayCount] = await Promise.all([
        redis.get(minuteKey),
        redis.get(hourKey),
        redis.get(dayKey),
      ])

      const currentMinute = parseInt(minuteCount || '0', 10)
      const currentHour = parseInt(hourCount || '0', 10)
      const currentDay = parseInt(dayCount || '0', 10)

      // Calcular límites restantes
      const remainingMinute = llmRateLimitConfig.limits.perMinute - currentMinute
      const remainingHour = llmRateLimitConfig.limits.perHour - currentHour
      const remainingDay = llmRateLimitConfig.limits.perDay - currentDay

      // Verificar límites (el más restrictivo primero)
      let limitExceeded = false
      let limitType = ''
      let retryAfter = 0

      if (currentMinute >= llmRateLimitConfig.limits.perMinute) {
        limitExceeded = true
        limitType = 'minute'
        retryAfter = 60
      } else if (currentHour >= llmRateLimitConfig.limits.perHour) {
        limitExceeded = true
        limitType = 'hour'
        retryAfter = 3600
      } else if (currentDay >= llmRateLimitConfig.limits.perDay) {
        limitExceeded = true
        limitType = 'day'
        retryAfter = 86400
      }

      // Agregar headers informativos
      response.header('X-RateLimit-Limit-Minute', llmRateLimitConfig.limits.perMinute.toString())
      response.header('X-RateLimit-Limit-Hour', llmRateLimitConfig.limits.perHour.toString())
      response.header('X-RateLimit-Limit-Day', llmRateLimitConfig.limits.perDay.toString())
      response.header('X-RateLimit-Remaining-Minute', Math.max(0, remainingMinute).toString())
      response.header('X-RateLimit-Remaining-Hour', Math.max(0, remainingHour).toString())
      response.header('X-RateLimit-Remaining-Day', Math.max(0, remainingDay).toString())

      if (limitExceeded) {
        // Activar cooldown
        await redis.setex(cooldownKey, llmRateLimitConfig.cooldownSeconds, '1')

        response.header('Retry-After', retryAfter.toString())
        return response.tooManyRequests({
          error: 'Rate limit exceeded',
          message: this.getErrorMessage(limitType),
          retryAfter,
          limits: {
            minute: { limit: llmRateLimitConfig.limits.perMinute, remaining: remainingMinute },
            hour: { limit: llmRateLimitConfig.limits.perHour, remaining: remainingHour },
            day: { limit: llmRateLimitConfig.limits.perDay, remaining: remainingDay },
          },
          type: limitType,
        })
      }

      // Incrementar contadores usando pipeline para eficiencia
      const pipeline = redis.pipeline()

      pipeline.incr(minuteKey)
      pipeline.expire(minuteKey, 60)

      pipeline.incr(hourKey)
      pipeline.expire(hourKey, 3600)

      pipeline.incr(dayKey)
      pipeline.expire(dayKey, 86400)

      await pipeline.exec()

      // Log para monitoreo
      if (llmRateLimitConfig.logLevel === 'warning' || llmRateLimitConfig.logLevel === 'all') {
        const warningLimit = llmRateLimitConfig.limits.perDay * llmRateLimitConfig.warningThreshold
        if (currentDay >= warningLimit) {
          console.warn(
            `[LLM Rate Limit Warning] Usuario ${userId} (IP: ${ip}) ha usado ${currentDay + 1}/${llmRateLimitConfig.limits.perDay} llamadas diarias`
          )
        }
      }

      if (llmRateLimitConfig.logLevel === 'all') {
        console.log(
          `[LLM Rate Limit] Usuario ${userId} - Minute: ${currentMinute + 1}/${llmRateLimitConfig.limits.perMinute}, Hour: ${currentHour + 1}/${llmRateLimitConfig.limits.perHour}, Day: ${currentDay + 1}/${llmRateLimitConfig.limits.perDay}`
        )
      }

      // Continuar con la request
      await next()
    } catch (error) {
      // Manejar error según estrategia configurada
      console.error('[LLM Rate Limit] Error en middleware:', error)

      if (llmRateLimitConfig.failStrategy === 'fail-closed') {
        return response.serviceUnavailable({
          error: 'Service temporarily unavailable',
          message: 'El servicio de rate limiting no está disponible. Por favor, intenta más tarde.',
        })
      }

      // fail-open: permitir la request
      await next()
    }
  }

  /**
   * Verifica si un usuario o IP está en la whitelist
   */
  private isWhitelisted(userId: string, ip: string): boolean {
    return (
      llmRateLimitConfig.whitelist.userIds.includes(userId) ||
      llmRateLimitConfig.whitelist.ips.includes(ip)
    )
  }

  /**
   * Obtiene el minuto actual como timestamp
   */
  private getCurrentMinute(): string {
    return Math.floor(Date.now() / (60 * 1000)).toString()
  }

  /**
   * Obtiene la hora actual como timestamp
   */
  private getCurrentHour(): string {
    return Math.floor(Date.now() / (60 * 60 * 1000)).toString()
  }

  /**
   * Obtiene el día actual como fecha YYYY-MM-DD
   */
  private getCurrentDay(): string {
    return new Date().toISOString().split('T')[0]
  }

  /**
   * Genera un mensaje de error apropiado según el tipo de límite excedido
   */
  private getErrorMessage(limitType: string): string {
    const messages = {
      minute:
        'Has excedido el límite de solicitudes por minuto. Por favor, espera antes de reintentar.',
      hour: 'Has excedido el límite de solicitudes por hora. Intenta más tarde.',
      day: 'Has alcanzado tu cuota diaria de análisis. Tu límite se restablecerá mañana.',
    }
    return messages[limitType as keyof typeof messages] || 'Límite de solicitudes excedido.'
  }
}
