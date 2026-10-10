import { Env } from '@adonisjs/core/env'

const isProduction = process.env.NODE_ENV === 'production'

const schema = {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  APP_NAME: Env.schema.string(),
  REDIS_URL: Env.schema.string(),
  GOOGLE_CLIENT_ID: Env.schema.string(),
  GOOGLE_CLIENT_SECRET: Env.schema.string(),
  GOOGLE_OAUTH_REDIRECT_URI: Env.schema.string(),
  FRONTEND_URL: Env.schema.string(),
  IMAGES_WORKER: Env.schema.string.optional(),
  R2_UPLOAD_WORKER_URL: Env.schema.string.optional(),
  R2_UPLOAD_WORKER_SECRET: Env.schema.string.optional(),
  REGISTRATION_MODE: Env.schema.enum.optional(['open', 'waiting_list'] as const),
  // Regularización de scores artísticos entre fotos casi idénticas.
  // ENABLED: engancha el motor al final de cada análisis (por defecto apagado).
  SCORES_SMOOTHING_ENABLED: Env.schema.boolean.optional(),
  SCORES_SMOOTHING_STRATEGY: Env.schema.enum.optional(['clip', 'dhash', 'both'] as const),
  GOOGLE_VISION_API_KEY: Env.schema.string.optional(),
  GOOGLE_MAPS_API_KEY: Env.schema.string.optional(),
  GOOGLE_GEOCODING_API_KEY: Env.schema.string.optional(),
}

// Fallback env.get() compatible wrapper
const envProxy = {
  get(key: keyof typeof schema) {
    const val = process.env[key]
    if (val === undefined) {
      throw new Error(`Missing env variable: ${key}`)
    }
    return val
  },
}

const env = isProduction ? envProxy : await Env.create(new URL('../', import.meta.url), schema)

export default env
