import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import redis from '@adonisjs/redis/services/main'
import llmRateLimitConfig from '#config/llm_rate_limit'

/**
 * Opciones por-ruta que sobreescriben el config global
 */
export type LlmRateLimitOptions = {
  perMinute?: number
  perHour?: number
  perDay?: number
  perMonth?: number
  cooldownSeconds?: number
  keyPrefix?: string // permite namespace separado en Redis (ej: 'chat')
}

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
 * - Opciones por-ruta para configuración específica de endpoint
 */
export default class LlmRateLimitMiddleware {
  async handle(
    { request, response, auth }: HttpContext,
    next: NextFn,
    options: LlmRateLimitOptions = {}
  ) {
    // Si el middleware está deshabilitado, continuar
    if (!llmRateLimitConfig.enabled) {
      await next()
      return
    }

    // Resolver límites efectivos: las opciones por-ruta tienen prioridad sobre el config global
    const limits = {
      perMinute: options.perMinute ?? llmRateLimitConfig.limits.perMinute,
      perHour: options.perHour ?? llmRateLimitConfig.limits.perHour,
      perDay: options.perDay ?? llmRateLimitConfig.limits.perDay,
      perMonth: options.perMonth ?? llmRateLimitConfig.limits.perMonth,
    }
    const cooldownSeconds = options.cooldownSeconds ?? llmRateLimitConfig.cooldownSeconds
    const keyPrefix = options.keyPrefix ? `llm_rate_limit_${options.keyPrefix}` : 'llm_rate_limit'

    // Aplicar límites más restrictivos para el usuario demo
    try {
      const demoEmail = process.env.DEMO_USER_EMAIL
      const user =
        auth.user ||
        (await auth
          .check()
          .then(() => auth.user)
          .catch(() => null))
      if (demoEmail && user?.email === demoEmail) {
        limits.perMinute = 3
        limits.perHour = 5
        limits.perDay = 10
        limits.perMonth = 100
      }
    } catch (error) {
      // Si hay error al obtener el usuario, continuar con límites normales
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
      const cooldownKey = `${keyPrefix}:cooldown:${identifier}`
      const isInCooldown = await redis.get(cooldownKey)

      if (isInCooldown) {
        const ttl = await redis.ttl(cooldownKey)
        return response.tooManyRequests({
          error: 'Rate limit exceeded',
          message: `Too many requests. Please wait ${ttl} seconds before retrying.`,
          retryAfter: ttl,
          type: 'cooldown',
        })
      }

      // Claves para diferentes ventanas de tiempo
      const minuteKey = `${keyPrefix}:minute:${identifier}:${this.getCurrentMinute()}`
      const hourKey = `${keyPrefix}:hour:${identifier}:${this.getCurrentHour()}`
      const dayKey = `${keyPrefix}:day:${identifier}:${this.getCurrentDay()}`
      const monthKey = `${keyPrefix}:month:${identifier}:${this.getCurrentMonth()}`

      // Obtener contadores actuales
      const [minuteCount, hourCount, dayCount, monthCount] = await Promise.all([
        redis.get(minuteKey),
        redis.get(hourKey),
        redis.get(dayKey),
        redis.get(monthKey),
      ])

      const currentMinute = parseInt(minuteCount || '0', 10)
      const currentHour = parseInt(hourCount || '0', 10)
      const currentDay = parseInt(dayCount || '0', 10)
      const currentMonth = parseInt(monthCount || '0', 10)

      // Calcular límites restantes
      const remainingMinute = limits.perMinute - currentMinute
      const remainingHour = limits.perHour - currentHour
      const remainingDay = limits.perDay - currentDay
      const remainingMonth = limits.perMonth - currentMonth

      // Verificar límites (el más restrictivo primero)
      let limitExceeded = false
      let limitType = ''
      let retryAfter = 0

      if (currentMinute >= limits.perMinute) {
        limitExceeded = true
        limitType = 'minute'
        retryAfter = 60
      } else if (currentHour >= limits.perHour) {
        limitExceeded = true
        limitType = 'hour'
        retryAfter = 3600
      } else if (currentDay >= limits.perDay) {
        limitExceeded = true
        limitType = 'day'
        retryAfter = 86400
      } else if (currentMonth >= limits.perMonth) {
        limitExceeded = true
        limitType = 'month'
        retryAfter = this.getSecondsUntilNextMonth()
      }

      // Agregar headers informativos
      response.header('X-RateLimit-Limit-Minute', limits.perMinute.toString())
      response.header('X-RateLimit-Limit-Hour', limits.perHour.toString())
      response.header('X-RateLimit-Limit-Day', limits.perDay.toString())
      response.header('X-RateLimit-Limit-Month', limits.perMonth.toString())
      response.header('X-RateLimit-Remaining-Minute', Math.max(0, remainingMinute).toString())
      response.header('X-RateLimit-Remaining-Hour', Math.max(0, remainingHour).toString())
      response.header('X-RateLimit-Remaining-Day', Math.max(0, remainingDay).toString())
      response.header('X-RateLimit-Remaining-Month', Math.max(0, remainingMonth).toString())

      if (limitExceeded) {
        // Activar cooldown
        await redis.setex(cooldownKey, cooldownSeconds, '1')

        response.header('Retry-After', retryAfter.toString())
        return response.tooManyRequests({
          error: 'Rate limit exceeded',
          message: this.getErrorMessage(limitType),
          retryAfter,
          limits: {
            minute: { limit: limits.perMinute, remaining: remainingMinute },
            hour: { limit: limits.perHour, remaining: remainingHour },
            day: { limit: limits.perDay, remaining: remainingDay },
            month: { limit: limits.perMonth, remaining: remainingMonth },
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

      pipeline.incr(monthKey)
      pipeline.expire(monthKey, this.getSecondsUntilNextMonth())

      await pipeline.exec()

      // Log para monitoreo
      if (llmRateLimitConfig.logLevel === 'warning' || llmRateLimitConfig.logLevel === 'all') {
        const warningLimit = limits.perDay * llmRateLimitConfig.warningThreshold
        if (currentDay >= warningLimit) {
          console.warn(
            `[LLM Rate Limit Warning] Usuario ${userId} (IP: ${ip}) ha usado ${currentDay + 1}/${limits.perDay} llamadas diarias`
          )
        }
      }

      if (llmRateLimitConfig.logLevel === 'all') {
        console.log(
          `[LLM Rate Limit] Usuario ${userId} - Minute: ${currentMinute + 1}/${limits.perMinute}, Hour: ${currentHour + 1}/${limits.perHour}, Day: ${currentDay + 1}/${limits.perDay}, Month: ${currentMonth + 1}/${limits.perMonth}`
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
   * Obtiene el mes actual como YYYY-MM
   */
  private getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7)
  }

  /**
   * Calcula los segundos restantes hasta el inicio del próximo mes
   */
  private getSecondsUntilNextMonth(): number {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return Math.ceil((nextMonth.getTime() - now.getTime()) / 1000)
  }

  /**
   * Genera un mensaje de error apropiado según el tipo de límite excedido
   */
  private getErrorMessage(limitType: string): string {
    const messages = {
      minute: 'You have exceeded the request limit per minute. Please wait before retrying.',
      hour: 'You have exceeded the request limit per hour. Please try again later.',
      day: 'You have reached your daily analysis quota. Your limit will reset tomorrow.',
      month: 'You have reached your monthly analysis quota. Your limit will reset next month.',
    }
    return messages[limitType as keyof typeof messages] || 'Request limit exceeded.'
  }
}
