import NodeCache from 'node-cache'
import redis from '@adonisjs/redis/services/main'

const nodeCache = new NodeCache()

interface CacheOptions {
  key?: ((...args: any[]) => string) | string
  provider?: 'nodecache' | 'redis'
  ttl?: number // en segundos
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

      // No almacenar en caché si el resultado es vacío (null, undefined, array vacío, objeto vacío)
      const isEmpty =
        result === null ||
        result === undefined ||
        (Array.isArray(result) && result.length === 0) ||
        (typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0)

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
