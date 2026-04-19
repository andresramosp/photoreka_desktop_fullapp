const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:5173/settings?payment=success',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:5173/settings?payment=cancelled',
}

export default stripeConfig
