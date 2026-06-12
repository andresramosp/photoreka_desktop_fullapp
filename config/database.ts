import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  prettyPrintDebugQueries: true,
  connection: 'postgres',
  connections: {
    postgres: {
      // debug: true,
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      },
      pool: {
        min: 2,
        max: 30,
        acquireTimeoutMillis: 120000,
        // Evict idle connections after 10s — well before the server/proxy kills them
        idleTimeoutMillis: 10000,
        reapIntervalMillis: 1000,
        // Don't let a failed connection creation abort pending acquisitions
        propagateCreateError: false,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
