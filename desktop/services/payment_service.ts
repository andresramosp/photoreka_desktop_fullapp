import PaymentService from '../../app/services/payment_service.js'
import CloudAccountService from './cloud_account_service.js'
import { isGateway } from '../mode.js'

/**
 * Sustituye a #services/payment_service (mapa "imports" de package.json). En el escritorio las
 * compras viven en la cuenta de la nube y la tabla payments no existe: la respuesta sale del
 * último perfil recibido de la nube. En el servicio de la nube se usa la original.
 */
export default class DesktopPaymentService extends PaymentService {
  static async hasCompletedPurchase(userId: number): Promise<boolean> {
    if (isGateway) return super.hasCompletedPurchase(userId)
    const account = await CloudAccountService.cachedAccount(userId)
    return account?.hasCompletedPurchase ?? false
  }
}
