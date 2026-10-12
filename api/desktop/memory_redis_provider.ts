import type { ApplicationService } from '@adonisjs/core/types'
import RedisMock from 'ioredis-mock'

/**
 * Sustituye a @adonisjs/redis en el escritorio: un solo usuario y un solo proceso, así que
 * todo lo que la API guarda en Redis (cachés, límites, semáforo del analizador) cabe en
 * memoria y se pierde al cerrar la app, que es lo esperado para esos datos.
 */
export default class MemoryRedisProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('redis' as any, async () => {
      const client = new RedisMock()
      const manager = {
        connection: () => client,
        runCommand: (command: string, ...args: any[]) => (client as any).call(command, ...args),
        quit: async () => {},
        disconnect: async () => {},
        quitAll: async () => {},
        disconnectAll: async () => {},
      }
      return new Proxy(manager, {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver)
          const value = (client as any)[prop]
          return typeof value === 'function' ? value.bind(client) : value
        },
      })
    })
  }
}
