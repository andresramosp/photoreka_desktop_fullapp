const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:5173/settings?payment=success',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:5173/settings?payment=cancelled',
  catalogCurrency: process.env.STRIPE_CATALOG_CURRENCY || 'eur',
  // ID del cupón de Stripe que se aplica automáticamente a todos los checkouts.
  // Dejarlo vacío para no aplicar ningún descuento global.
  // Para descuentos por producto o usuario, crear cupones específicos en el
  // Stripe Dashboard y pasarlos al crear la sesión (ver createCheckoutSession).
  promotionCouponId: process.env.STRIPE_PROMOTION_COUPON_ID || '',
}

export default stripeConfig
