import PaymentService from '../../app/services/payment_service.js'
import CloudAccountService from './cloud_account_service.js'

/**
 * Sustituye a #services/payment_service en el escritorio (mapa "imports" de package.json).
 * Las compras viven en la cuenta de la nube y la tabla payments no existe en local: la
 * respuesta sale del último perfil recibido de la nube. El resto se hereda tal cual.
 */
export default class DesktopPaymentService extends PaymentService {
  static async hasCompletedPurchase(userId: number): Promise<boolean> {
    const account = await CloudAccountService.cachedAccount(userId)
    return account?.hasCompletedPurchase ?? false
  }
}
