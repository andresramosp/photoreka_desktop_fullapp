import type { HttpContext } from '@adonisjs/core/http'
import PortfolioReviewManager from '../managers/portfolio_review_manager.js'
import type { ReviewType } from '../managers/portfolio_review_manager.js'

export default class PortfolioReviewController {
  /**
   * Obtiene los patrones identificados en el portfolio del usuario
   * GET /portfolio-review/:reviewType
   * reviewType: 'narrative' | 'contextual' | 'aesthetic'
   */
  public async getPatterns({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const reviewType = (params.reviewType || 'narrative') as ReviewType

      const portfolioReviewManager = new PortfolioReviewManager()
      const result = await portfolioReviewManager.getPatterns(userId, reviewType, false)

      return response.ok(result)
    } catch (error) {
      console.error('Error en getPatterns:', error)
      return response.internalServerError({
        message: 'Error analizando patrones del portfolio',
        error: error.message,
      })
    }
  }

  /**
   * Endpoint público para obtener patrones por userId
   * GET /portfolio-review/:reviewType/user/:userId
   */
  public async getPatternsByUserId({ params, response }: HttpContext) {
    try {
      const { userId, reviewType } = params
      const reviewTypeParam = (reviewType || 'narrative') as ReviewType

      const portfolioReviewManager = new PortfolioReviewManager()
      const result = await portfolioReviewManager.getPatterns(userId, reviewTypeParam)

      return response.ok(result)
    } catch (error) {
      console.error('Error en getPatternsByUserId:', error)
      return response.internalServerError({
        message: 'Error analizando patrones del portfolio',
        error: error.message,
      })
    }
  }
}
