import PaymentService from '../../app/services/payment_service.js'

/**
 * Sustituye a #services/payment_service en el escritorio (mapa "imports" de package.json).
 * Las compras viven en la cuenta de la nube y la tabla payments no existe en local: hasta que
 * el escritorio consulte esa cuenta, no hay compras locales. El resto se hereda tal cual.
 */
export default class DesktopPaymentService extends PaymentService {
  static async hasCompletedPurchase(_userId: number): Promise<boolean> {
    return false
  }
}
