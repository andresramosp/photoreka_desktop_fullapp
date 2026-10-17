import { defineConfig } from '@adonisjs/core/app'

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
    // Escritorio: Redis en memoria (ver README de Desktop, archivos sustituidos).
    () => import('./desktop/memory_redis_provider.js'),
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
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/ws'),
    () => import('#start/events'),
    () => import('#start/photo_deletion_scheduler'),
    // Escritorio: sin reanudación de Picks, que es un producto de la nube; la cuenta se
    // sincroniza con la nube (después de kernel, que aplica las migraciones).
    { file: () => import('./desktop/start/cloud_sync.js'), environment: ['web'] },
    { file: () => import('./desktop/start/local_thumbnails.js'), environment: ['web'] },
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
