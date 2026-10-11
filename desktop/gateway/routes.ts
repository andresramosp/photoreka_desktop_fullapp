import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// Rutas del servicio de la nube del escritorio (modo gateway). Son las únicas que expone.
const GatewayController = () => import('./gateway_controller.js')

router.get('/gateway/health', [GatewayController, 'health'])

router
  .group(() => {
    router.post('/compute', [GatewayController, 'compute'])
    router.post('/analysis', [GatewayController, 'analysis'])
    router.post('/uploads/sign', [GatewayController, 'signUpload'])
    router.post('/quota/check', [GatewayController, 'quotaCheck'])
    router.post('/quota/consume', [GatewayController, 'quotaConsume'])
  })
  .prefix('/gateway')
  .use(middleware.auth())
