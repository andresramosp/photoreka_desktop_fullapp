/**
 * Configuración de rate limiting para endpoints que usan LLM
 *
 * Estos valores pueden ser ajustados según las necesidades del negocio:
 * - Aumentar límites para usuarios premium
 * - Reducir límites durante períodos de alta carga
 * - Ajustar cooldowns para balance entre UX y protección
 */

// Helper para obtener valores numéricos del environment
function getNumberFromEnv(key: string, defaultValue: number): number {
  const value = process.env[key]
  return value ? parseInt(value, 10) : defaultValue
}

// Helper para obtener valores booleanos del environment
function getBooleanFromEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

// Helper para obtener strings del environment
function getStringFromEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

// Helper para obtener arrays del environment
function getArrayFromEnv(key: string): string[] {
  const value = process.env[key]
  return value ? value.split(',').filter(Boolean) : []
}

export default {
  /**
   * Límites de requests por ventana de tiempo
   */
  limits: {
    // Límite por minuto - protección contra burst attacks
    perMinute: getNumberFromEnv('LLM_RATE_LIMIT_PER_MINUTE', 20),

    // Límite por hora - prevención de abuso moderado
    perHour: getNumberFromEnv('LLM_RATE_LIMIT_PER_HOUR', 60),

    // Límite por día - cuota diaria total
    perDay: getNumberFromEnv('LLM_RATE_LIMIT_PER_DAY', 200),

    // Límite por mes - cuota mensual total
    perMonth: getNumberFromEnv('LLM_RATE_LIMIT_PER_MONTH', 2000),
  },

  /**
   * Tiempo de cooldown en segundos después de exceder límites
   * Durante este período, todas las requests serán rechazadas
   */
  cooldownSeconds: getNumberFromEnv('LLM_RATE_LIMIT_COOLDOWN', 60),

  /**
   * Habilitar/deshabilitar el middleware
   * Útil para desarrollo o mantenimiento
   */
  enabled: getBooleanFromEnv('LLM_RATE_LIMIT_ENABLED', true),

  /**
   * Estrategia cuando Redis falla:
   * - 'fail-open': Permite las requests (más permisivo, mejor UX)
   * - 'fail-closed': Rechaza las requests (más seguro, pero puede afectar servicio)
   */
  failStrategy: getStringFromEnv('LLM_RATE_LIMIT_FAIL_STRATEGY', 'fail-open') as
    | 'fail-open'
    | 'fail-closed',

  /**
   * Nivel de logging
   * - 'none': No loguear
   * - 'warning': Solo advertencias cuando se acercan al límite
   * - 'all': Loguear todos los intentos
   */
  logLevel: getStringFromEnv('LLM_RATE_LIMIT_LOG_LEVEL', 'warning') as 'none' | 'warning' | 'all',

  /**
   * Porcentaje del límite diario para empezar a mostrar advertencias
   * Ejemplo: 0.8 = advertir cuando se alcanza el 80% del límite
   */
  warningThreshold: 0.8,

  /**
   * IPs o usuarios que están exentos del rate limiting
   * Útil para servicios internos o cuentas de administrators
   */
  whitelist: {
    ips: getArrayFromEnv('LLM_RATE_LIMIT_WHITELIST_IPS'),
    userIds: getArrayFromEnv('LLM_RATE_LIMIT_WHITELIST_USERS'),
  },
}
