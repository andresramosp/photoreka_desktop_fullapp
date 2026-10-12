import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import CloudAccountService from '../services/cloud_account_service.js'

// Copia de la nube la cuota y los créditos al arrancar y cada 15 minutos. Espera a que la
// app esté lista porque Adonis carga las precargas a la vez y la de kernel aplica las
// migraciones (incluida la tabla cloud_sessions).
const INTERVAL_MS = 15 * 60 * 1000

const sync = () =>
  CloudAccountService.syncAll().catch((error) => logger.warn(`[cloud] sincronización fallida: ${error.message}`))

app.ready(() => {
  sync()
  setInterval(sync, INTERVAL_MS).unref()
})
