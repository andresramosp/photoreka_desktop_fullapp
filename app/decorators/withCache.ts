import NodeCache from 'node-cache'
import redis from '@adonisjs/redis/services/main'

const nodeCache = new NodeCache()

interface CacheOptions {
  key?: ((...args: any[]) => string) | string
  provider?: 'nodecache' | 'redis'
  ttl?: number // en segundos
  /** Override the default semantic-emptiness check for this specific cache. */
  isEmpty?: (result: any) => boolean
}

/**
 * Determines whether a cache result is semantically empty and should not be stored.
 *
 * Rules (applied recursively):
 *  - null / undefined                              → empty
 *  - array with length 0                           → empty
 *  - plain object with no keys                     → empty
 *  - plain object that contains at least one array → empty only if ALL those arrays are empty
 *  - plain object with no arrays (only scalars /
 *    nested objects)                               → empty only if ALL values are recursively empty
 *  - any primitive (number, string, boolean, …)    → NOT empty
 *
 * Examples:
 *  isSemanticallyCacheEmpty([])                                      → true
 *  isSemanticallyCacheEmpty({ results: [] })                         → true
 *  isSemanticallyCacheEmpty({ tags: [], metadata: { count: 1122 } }) → true  ← tagcloud case
 *  isSemanticallyCacheEmpty({ data: [{ id: 1 }], total: 1 })         → false
 *  isSemanticallyCacheEmpty({ count: 5 })                            → false
 */
export function isSemanticallyCacheEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>)
    if (values.length === 0) return true
    const arrays = values.filter(Array.isArray)
    if (arrays.length > 0) {
      // If every direct array in this object is empty, the result is empty
      return arrays.every((arr) => isSemanticallyCacheEmpty(arr))
    }
    // No direct arrays: recurse into nested objects/primitives
    return values.every((v) => isSemanticallyCacheEmpty(v))
  }
  // Primitive (number, string, boolean, …) → not empty
  return false
}

export function withCache(options: CacheOptions = {}) {
  const provider = options.provider || 'nodecache'
  const ttl = options.ttl ?? 0 // 0 = no expiry

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      let cacheKey: string

      // const ctx = HttpContext.get()
      // const userId = ctx?.auth?.user?.id
      if (options.key) {
        let rawKey = typeof options.key === 'function' ? options.key(...args) : options.key

        // Normalización automática si la key generada contiene arrays
        if (Array.isArray(rawKey)) {
          cacheKey = `${propertyKey}_${JSON.stringify([...rawKey].sort())}`
        } else {
          cacheKey = rawKey
        }
      } else {
        const serializedArgs = JSON.stringify(
          args.map((arg) => (Array.isArray(arg) ? [...arg].sort() : arg))
        )
        cacheKey = `${propertyKey}_${serializedArgs}`
      }

      const redisCacheKey = `cache:${cacheKey}`

      if (provider === 'nodecache') {
        const cached = nodeCache.get(cacheKey)
        if (cached !== undefined) {
          return cached
        }
      } else {
        const cached = await redis.get(redisCacheKey)
        if (cached) {
          console.log(`[withCache] Redis cache HIT for key: ${redisCacheKey.substring(0, 50)}...`)
          return JSON.parse(cached)
        }
        console.log(`[withCache] Redis cache MISS for key: ${redisCacheKey.substring(0, 50)}...`)
      }

      const result = await originalMethod.apply(this, args)

      const isEmpty = options.isEmpty ? options.isEmpty(result) : isSemanticallyCacheEmpty(result)

      if (!isEmpty) {
        if (provider === 'nodecache') {
          nodeCache.set(cacheKey, result, ttl) // ttl=0 means no expiry in node-cache
        } else {
          if (ttl > 0) {
            await redis.set(redisCacheKey, JSON.stringify(result), 'EX', ttl)
          } else {
            await redis.set(redisCacheKey, JSON.stringify(result))
          }
        }
      }
      return result
    }
  }
}

/**
 * Invalidate all Redis cache keys matching a glob pattern (e.g. 'getPhotosIdsForSearch:5:*')
 */
export async function invalidateCacheByPattern(pattern: string) {
  const redisPattern = `cache:${pattern}`
  const keys = await redis.keys(redisPattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
  console.log(`[invalidateCacheByPattern] Deleted ${keys.length} key(s) matching: ${redisPattern}`)
}

/**
 * Invalidate all Redis cache keys matching a glob pattern (e.g. 'getPhotosIdsForSearch:5:*')
 */
export async function removeByKey(key: string) {
  const redisPattern = `${key}`
  const keys = await redis.keys(redisPattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
  console.log(`[removeByKey] Deleted ${keys.length} key(s) matching: ${redisPattern}`)
}

export async function invalidateCache(key?: string, provider: 'nodecache' | 'redis' = 'redis') {
  if (provider === 'nodecache') {
    if (key) {
      const deleted = nodeCache.del(key)
      console.log(`[invalidateCache] Nodecache key ${deleted ? 'DELETED' : 'NOT FOUND'}: ${key}`)
    } else {
      nodeCache.flushAll()
      console.log(`[invalidateCache] Nodecache flushed all keys`)
    }
  } else {
    if (key) {
      const redisCacheKey = `cache:${key}`
      const deleted = await redis.del(redisCacheKey)
      console.log(
        `[invalidateCache] Redis key ${deleted > 0 ? 'DELETED' : 'NOT FOUND'}: ${redisCacheKey} (count: ${deleted})`
      )
    } else {
      // Delete only keys in the 'cache:' namespace — avoids wiping unrelated data (e.g. agent history)
      const keys = await redis.keys('cache:*')
      if (keys.length > 0) {
        await redis.del(...keys)
      }
      console.log(`[invalidateCache] Redis flushed ${keys.length} cache key(s)`)
    }
  }
}
