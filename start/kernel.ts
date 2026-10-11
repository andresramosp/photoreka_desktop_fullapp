/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import {
  invalidateCache,
  invalidateCacheByPattern,
  removeByKey,
} from '../app/decorators/withCache.js'
import { CacheInvalidationService } from '#services/cache_invalidation_service'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('#middleware/force_json_response_middleware'),
  () => import('#middleware/gzip_json_response_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/static/static_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/activity_logger_middleware'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([() => import('@adonisjs/core/bodyparser_middleware')])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  readOnly: () => import('#middleware/read_only_middleware'),
  llmRateLimit: () => import('#middleware/llm_rate_limit_middleware'),
})

const migrator = new MigrationRunner(db, app, {
  direction: 'up',
  dryRun: false,
})

// removeByKey('location_inference:*')
// CacheInvalidationService.invalidateAll(70)

// Escritorio: el servicio de la nube (modo gateway) trabaja contra la base de producción y
// nunca aplica migraciones; las de la nube son cosa de App.
if (process.env.PHOTOREKA_MODE !== 'gateway') {
  try {
    await migrator.run()
    console.log('Migraciones ejecutadas correctamente.')
  } catch (error) {
    console.error('Error ejecutando migraciones:', error)
  } finally {
    await db.manager.closeAll()
  }
}
