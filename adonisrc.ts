import { defineConfig } from '@adonisjs/core/app'

// Escritorio: modo gateway = servicio de la nube del escritorio (ver desktop/mode.ts).
const isGateway = process.env.PHOTOREKA_MODE === 'gateway'
const skip = () => Promise.resolve({})

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [() => import('@adonisjs/core/commands'), () => import('@adonisjs/lucid/commands')],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/static/static_provider'),
    // Escritorio: Redis en memoria; el servicio de la nube usa el Redis de verdad.
    () => (isGateway ? import('@adonisjs/redis/redis_provider') : import('./desktop/memory_redis_provider.js')),
    () => import('@adonisjs/auth/auth_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    // Primero de la lista a propósito: tapa un global que falta en el Node de
    // producción y del que depende cualquier llamada a un modelo (ver el fichero).
    () => import('#start/polyfills'),
    () => import('#start/kernel'),
    // Escritorio: el servicio de la nube solo expone sus rutas, y no tiene sockets, eventos ni
    // tareas programadas (trabaja contra la base de producción). Sin reanudación de Picks.
    () => (isGateway ? import('./desktop/gateway/routes.js') : import('#start/routes')),
    () => (isGateway ? skip() : import('#start/ws')),
    () => (isGateway ? skip() : import('#start/events')),
    () => (isGateway ? skip() : import('#start/photo_deletion_scheduler')),
    // Puente con la nube y sincronización de la cuenta (solo escritorio).
    () => (isGateway ? skip() : import('./desktop/cloud_bridge.js')),
    { file: () => (isGateway ? skip() : import('./desktop/start/cloud_sync.js')), environment: ['web'] },
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec(.ts|.js)'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec(.ts|.js)'],
        name: 'functional',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },
  metaFiles: [
    {
      pattern: 'public/**',
      reloadServer: false,
    },
    {
      pattern: 'app/content/**',
      reloadServer: false,
    },
  ],
})
