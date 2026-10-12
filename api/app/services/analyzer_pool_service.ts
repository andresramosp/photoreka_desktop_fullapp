import redis from '@adonisjs/redis/services/main'
import analyzerPoolConfig from '#config/analyzer_pool'
import Logger from '../utils/logger.js'

const logger = Logger.getInstance('AnalyzerPool')

/**
 * Semáforo de concurrencia basado en Redis para los procesos de análisis pesados.
 *
 * Implementado como un sorted set (ZSET) donde:
 *  - member = processId
 *  - score  = timestamp (ms) del ÚLTIMO heartbeat del proceso
 *
 * Mientras un proceso está vivo, un temporizador de fondo refresca su score
 * cada `heartbeatSeconds`. Por eso un slot NO se libera por la duración total
 * del proceso (pueden durar horas): solo se reclama si el proceso DEJA de latir
 * durante más de `staleMinutes` (instancia caída o reiniciada).
 *
 * La adquisición es atómica vía Lua para ser segura entre múltiples instancias
 * del servicio analyzer.
 */
export default class AnalyzerPoolService {
  private static readonly KEY = 'analyzer:pool:active'

  /**
   * Lua: purga slots sin heartbeat reciente, y si hay hueco añade el processId.
   * KEYS[1] = pool key
   * ARGV[1] = now (ms)
   * ARGV[2] = staleThreshold (ms) -> se eliminan members con score < (now - stale)
   * ARGV[3] = capacity (N)
   * ARGV[4] = processId
   * Devuelve 1 si se adquirió el slot, 0 si el pool está lleno.
   */
  private static readonly ACQUIRE_SCRIPT = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local staleMs = tonumber(ARGV[2])
    local capacity = tonumber(ARGV[3])
    local member = ARGV[4]
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - staleMs)
    -- Si ya está dentro (re-entrante), refresca el score y considera adquirido.
    if redis.call('ZSCORE', key, member) then
      redis.call('ZADD', key, now, member)
      return 1
    end
    local count = redis.call('ZCARD', key)
    if count < capacity then
      redis.call('ZADD', key, now, member)
      return 1
    end
    return 0
  `

  private static staleMs(): number {
    return analyzerPoolConfig.staleMinutes * 60 * 1000
  }

  /**
   * Intenta adquirir un slot respetando la capacidad del pool.
   * @returns true si se adquirió, false si el pool está lleno.
   */
  static async tryAcquire(processId: string | number): Promise<boolean> {
    try {
      const result = await redis.eval(
        this.ACQUIRE_SCRIPT,
        1,
        this.KEY,
        String(Date.now()),
        String(this.staleMs()),
        String(analyzerPoolConfig.size),
        String(processId)
      )
      return Number(result) === 1
    } catch (error) {
      // Si Redis falla, no bloqueamos el análisis: permitimos ejecutar.
      logger.error(
        `tryAcquire falló (se permite ejecución): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return true
    }
  }

  /**
   * Adquiere un slot ignorando la capacidad (override manual desde Admin).
   * Siempre marca el proceso como activo en el pool.
   */
  static async forceAcquire(processId: string | number): Promise<void> {
    try {
      await redis.zadd(this.KEY, Date.now(), String(processId))
    } catch (error) {
      logger.error(`forceAcquire falló: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Libera el slot ocupado por un proceso.
   */
  static async release(processId: string | number): Promise<void> {
    try {
      await redis.zrem(this.KEY, String(processId))
    } catch (error) {
      logger.error(
        `release falló para proceso ${processId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Refresca el heartbeat de un proceso (actualiza su score al tiempo actual).
   * No re-crea el slot si fue eliminado: usa XX para actualizar solo si existe,
   * evitando "resucitar" un slot que ya fue liberado/reclamado.
   */
  private static async beat(processId: string | number): Promise<void> {
    try {
      await redis.zadd(this.KEY, 'XX', Date.now(), String(processId))
    } catch (error) {
      logger.error(
        `heartbeat falló para proceso ${processId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Inicia el heartbeat de fondo para un proceso en ejecución. Devuelve el
   * handle del intervalo, que debe pasarse a `stopHeartbeat` al terminar.
   *
   * Si la instancia se cae, el intervalo muere con ella: el proceso deja de
   * latir y su slot se reclama automáticamente tras `staleMinutes`.
   */
  static startHeartbeat(processId: string | number): NodeJS.Timeout {
    const intervalMs = analyzerPoolConfig.heartbeatSeconds * 1000
    const handle = setInterval(() => {
      this.beat(processId).catch(() => {})
    }, intervalMs)
    // No mantener vivo el event loop solo por el heartbeat.
    if (typeof handle.unref === 'function') handle.unref()
    return handle
  }

  /**
   * Detiene un heartbeat previamente iniciado.
   */
  static stopHeartbeat(handle: NodeJS.Timeout | null | undefined): void {
    if (handle) clearInterval(handle)
  }

  /**
   * Número de slots actualmente ocupados (tras purgar stale).
   */
  static async getCount(): Promise<number> {
    try {
      const now = Date.now()
      await redis.zremrangebyscore(this.KEY, '-inf', now - this.staleMs())
      return await redis.zcard(this.KEY)
    } catch {
      return 0
    }
  }

  /**
   * Lista los procesos activos en el pool con su timestamp de adquisición.
   */
  static async getActive(): Promise<{ processId: string; since: string }[]> {
    try {
      const now = Date.now()
      await redis.zremrangebyscore(this.KEY, '-inf', now - this.staleMs())
      const raw = await redis.zrange(this.KEY, 0, -1, 'WITHSCORES')
      const active: { processId: string; since: string }[] = []
      for (let i = 0; i < raw.length; i += 2) {
        active.push({
          processId: raw[i],
          since: new Date(Number(raw[i + 1])).toISOString(),
        })
      }
      return active
    } catch {
      return []
    }
  }

  /**
   * Estado resumido del pool para el panel de Admin.
   */
  static async getStatus(): Promise<{
    active: number
    capacity: number
    activeProcessIds: string[]
  }> {
    const activeList = await this.getActive()
    return {
      active: activeList.length,
      capacity: analyzerPoolConfig.size,
      activeProcessIds: activeList.map((a) => a.processId),
    }
  }
}
