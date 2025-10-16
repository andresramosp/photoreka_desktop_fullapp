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
  const ttl = options.ttl || 60

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

      if (provider === 'nodecache') {
        const cached = nodeCache.get(cacheKey)
        if (cached !== undefined) {
          console.log(`[withCache] Cache HIT (nodecache): ${cacheKey}`)
          return cached
        }
      } else {
        const cached = await redis.get(cacheKey)
        if (cached) {
          console.log(`[withCache] Cache HIT (redis): ${cacheKey}`)
          return JSON.parse(cached)
        }
      }

      console.log(`[withCache] Cache MISS: ${cacheKey}`)
      const result = await originalMethod.apply(this, args)

      if (provider === 'nodecache') {
        nodeCache.set(cacheKey, result, ttl)
        console.log(`[withCache] Key stored in nodecache: ${cacheKey}`)
      } else {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl)
        console.log(`[withCache] Key stored in redis: ${cacheKey}`)
      }
      return result
    }
  }
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
      const deleted = await redis.del(key)
      console.log(
        `[invalidateCache] Redis key ${deleted > 0 ? 'DELETED' : 'NOT FOUND'}: ${key} (count: ${deleted})`
      )
    } else {
      await redis.flushall()
      console.log(`[invalidateCache] Redis flushed all keys`)
    }
  }
}
