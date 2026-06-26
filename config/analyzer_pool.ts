/**
 * Configuración del pool de concurrencia del analyzer.
 *
 * Limita el número de procesos de análisis pesados (`process`) que se ejecutan
 * simultáneamente para no saturar BD/CPU. Si no hay slots libres, el proceso
 * queda en estado `queued` y debe lanzarse manualmente desde el panel de Admin.
 */

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const analyzerPoolConfig = {
  /** Número máximo de procesos `process` ejecutándose en paralelo. */
  size: parsePositiveInt(process.env.ANALYZER_POOL_SIZE, 4),

  /**
   * Cada cuántos segundos un proceso en ejecución refresca su "latido"
   * (heartbeat) en Redis para mantener su slot ocupado. Mientras el proceso
   * siga vivo, late periódicamente y NUNCA pierde su slot, por largo que dure.
   */
  heartbeatSeconds: parsePositiveInt(process.env.ANALYZER_POOL_HEARTBEAT_SECONDS, 60),

  /**
   * Minutos sin recibir heartbeat tras los cuales un slot se considera
   * "stale" (el proceso se cayó o la instancia se reinició) y se libera
   * automáticamente. NO depende de la duración total del proceso: un proceso
   * sano que late no se libera nunca; solo se reclama si DEJA de latir.
   * Debe ser holgadamente mayor que heartbeatSeconds (varios latidos perdidos).
   */
  staleMinutes: parsePositiveInt(process.env.ANALYZER_POOL_STALE_MINUTES, 5),

  /** Email del admin que recibe la notificación de proceso en cola. */
  adminEmail: process.env.ANALYZER_POOL_ADMIN_EMAIL || 'andreschennai@gmail.com',
}

export default analyzerPoolConfig
