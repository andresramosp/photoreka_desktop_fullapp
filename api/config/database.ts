import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

/**
 * El analyzer y la API de usuario corren el mismo codigo contra la misma base de
 * datos, pero no deben competir por ella en igualdad de condiciones.
 *
 * Medido sobre produccion: la busqueda de tags similares (VectorService.
 * findSimilarTagDirect) se resuelve con un Parallel Seq Scan sobre las ~513k filas
 * de `tags`, y Postgres le asigna 2 workers ademas del proceso principal. El
 * analyzer lanza hasta 15 de esas busquedas a la vez, asi que en rafaga ocupa unos
 * 45 procesos y no deja nucleos libres: un SELECT trivial de la API de usuario no
 * espera por CPU consumida, espera por nucleos ocupados, y de ahi salian los 3-4
 * segundos en el detalle de foto mientras corria un analisis.
 *
 * Con IS_ANALYZER=true cada conexion desactiva el paralelismo intra-consulta, de
 * modo que una busqueda usa un proceso en lugar de tres. Cada consulta tarda mas y
 * el analisis va algo mas lento: es deliberado, a cambio de que deje de canibalizar
 * la maquina.
 */
// Se leen de process.env y no de env.get(): el envProxy de start/env.ts lanza
// excepcion en produccion ante cualquier variable ausente, y estas son opcionales.
const isAnalyzer = process.env.IS_ANALYZER === 'true'
const poolMax = Number(process.env.DB_POOL_MAX) || 30

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
        // Segunda palanca para acotar al analyzer, por si desactivar el paralelismo
        // no basta: menos conexiones son menos consultas simultaneas. Se deja en 30
        // por defecto para no cambiar nada sin decidirlo.
        max: poolMax,
        acquireTimeoutMillis: 120000,
        // Evict idle connections after 10s — well before the server/proxy kills them
        idleTimeoutMillis: 10000,
        reapIntervalMillis: 1000,
        // Don't let a failed connection creation abort pending acquisitions
        propagateCreateError: false,
        // Se ejecuta una vez por conexion nueva del pool, antes de entregarla.
        afterCreate: (connection: any, done: (err: Error | null, conn: any) => void) => {
          // Los indices HNSW son comunes a todos los usuarios y las busquedas filtran por
          // usuario despues: sin escaneo iterativo, el indice entrega ~40 candidatos y un
          // catalogo grande conservaba solo el 2-15% de sus resultados (medido en local).
          const statements = [
            'SET hnsw.iterative_scan = relaxed_order',
            'SET hnsw.max_scan_tuples = 100000',
          ]
          if (isAnalyzer) statements.push('SET max_parallel_workers_per_gather = 0')
          connection.query(statements.join('; '), (err: Error | null) => {
            done(err, connection)
          })
        },
      },
      migrations: {
        naturalSort: true,
        // Escritorio: migraciones propias (ver README de Desktop, archivos sustituidos).
        paths: ['desktop/migrations'],
      },
    },
  },
})

export default dbConfig
