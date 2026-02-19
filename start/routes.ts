/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import AnalyzerProcessController from '#controllers/analyzer_process_controller'
import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
import axios from 'axios'
import archiver from 'archiver'
import pLimit from 'p-limit'
import Photo from '#models/photo'
import WarmupController from '#controllers/warmup_controller'
import AuthLrController from '#controllers/auth_lr_controller'

// Auth routes (no middleware needed)
const AuthController = () => import('#controllers/auth_controller')
router.post('/api/auth/register', [AuthController, 'register'])
router.post('/api/auth/login', [AuthController, 'login'])
router.post('/api/auth/demo-login', [AuthController, 'demoLogin']) // Demo login endpoint
router.post('/api/auth/confirm-email', [AuthController, 'confirmEmail'])
router.post('/api/auth/resend-confirmation', [AuthController, 'resendConfirmation'])
router.post('/api/auth/forgot-password', [AuthController, 'forgotPassword'])
router.post('/api/auth/reset-password', [AuthController, 'resetPassword'])

// Google OAuth routes (no middleware needed)
router.get('/api/auth/google/redirect', [AuthController, 'googleRedirect'])
router.get('/api/auth/google/callback', [AuthController, 'googleCallback'])

// Protected auth routes (require authentication)
router
  .group(() => {
    router.post('/api/auth/logout', [AuthController, 'logout'])
    router.get('/api/auth/profile', [AuthController, 'profile'])
    router.put('/api/auth/profile', [AuthController, 'updateProfile'])
    router.post('/api/auth/change-password', [AuthController, 'changePassword'])
  })
  .use(middleware.auth())

// Invites routes (require authentication)
const InvitesController = () => import('#controllers/invites_controller')
router.group(() => {
  router.post('/api/invites/generate', [InvitesController, 'generateInvite'])
  router.get('/api/invites', [InvitesController, 'listInvites'])
  router.post('/api/invites/send', [InvitesController, 'sendInvite'])
})
// .use(middleware.auth())

router
  .group(() => {
    router.post('/api/auth_lr/create-handoff', [AuthLrController, 'createHandoff'])
  })
  .use(middleware.auth())

router.post('/api/auth_lr/consume-handoff', [AuthLrController, 'consumeHandoff'])

const AnalyzerController = () => import('#controllers/analyzer_controller')
const CatalogController = () => import('#controllers/catalog_controller')
const SearchController = () => import('#controllers/search_controller')
const TagsController = () => import('#controllers/tags_controller')
const EmbeddingController = () => import('#controllers/embeddings_controller')
const LandingController = () => import('#controllers/landing_controller')
const CollectionsController = () => import('#controllers/collections_controller')
const SeriesController = () => import('#controllers/series_controller')
const UsageController = () => import('#controllers/usage_controller')
const ThreeDViewController = () => import('#controllers/3dview_controller')
const PortfolioReviewController = () => import('#controllers/portfolio_review_controller')
const ChatController = () => import('#controllers/chat_controller')

// Landing page endpoints (no auth required)
router.post('/api/landing/waiting-list', [LandingController, 'waitingList'])

// 3D Visualization public endpoint (no auth required)
router.post('/api/3d/catalog/:id', [ThreeDViewController, 'get3DPhotosByIdOrUsername'])

// Series public endpoint (no auth required)
router.get('/api/series/by-name/:name', [SeriesController, 'showByName'])

// Portfolio Review public endpoint (no auth required)
router.get('/api/portfolio-review/:reviewType/user/:userId', [
  PortfolioReviewController,
  'getPatternsByUserId',
])

// Endpoints health (sin auth)
router.get('/api/analyzer/health/user', [AnalyzerController, 'healthForUser'])
router.get('/api/analyzer/health/photo', [AnalyzerController, 'healthForPhoto'])
router.get('/api/analyzer/health/process', [AnalyzerController, 'healthForProcess'])

// Protected API routes (require authentication)
router
  .group(() => {
    router.get('/api/catalog', [CatalogController, 'getPhotos'])
    router.get('/api/catalog/:id', [CatalogController, 'getPhoto'])
    router.post('/api/catalog/delete', [CatalogController, 'deletePhotos'])
    router.post('/api/catalog/photosByIds', [CatalogController, 'getPhotosByIds'])

    router.post('/api/catalog/uploadPhoto', [CatalogController, 'uploadPhoto'])

    router.post('/api/catalog/checkDuplicates', [CatalogController, 'checkDuplicates'])
    router.post('/api/catalog/deleteDuplicates', [CatalogController, 'deleteDuplicates'])

    router.post('/api/catalog/:id/note', [CatalogController, 'savePhotoNote'])

    router.get('/api/analyzer-process', [AnalyzerProcessController, 'getAll'])
    router.get('/api/analyzer-process/:id', [AnalyzerProcessController, 'getById'])

    router.post('/api/search/tags/sync', [SearchController, 'searchByTagsSync'])
    router.post('/api/search/tags/direct', [SearchController, 'searchByTagsDirect'])
    router.post('/api/search/byPhotos', [SearchController, 'searchByPhotos'])
    router.get('/api/search/refs/:searchId', [SearchController, 'getSearchRefs'])
    router.get('/api/warmUp/:endpointType', [WarmupController, 'warmUp'])

    router.get('/api/tags/search', [TagsController, 'search'])

    // Collections endpoints
    router.get('/api/collections', [CollectionsController, 'index'])
    router.get('/api/collections/:id', [CollectionsController, 'show'])
    router.post('/api/collections', [CollectionsController, 'store'])
    router.put('/api/collections/:id', [CollectionsController, 'update'])
    router.delete('/api/collections/:id', [CollectionsController, 'destroy'])
    router.post('/api/collections/:id/photos', [CollectionsController, 'addPhotos'])
    router.delete('/api/collections/:id/photos', [CollectionsController, 'removePhotos'])

    // Series endpoints
    router.get('/api/series', [SeriesController, 'index'])
    router.get('/api/series/:id', [SeriesController, 'show'])
    router.post('/api/series', [SeriesController, 'store'])
    router.put('/api/series/:id', [SeriesController, 'update'])
    router.delete('/api/series/:id', [SeriesController, 'destroy'])
    router.post('/api/series/:id/photos', [SeriesController, 'addPhotos'])
    router.delete('/api/series/:id/photos', [SeriesController, 'removePhotos'])
    router.put('/api/series/:id/order', [SeriesController, 'updateOrder'])
    router.put('/api/series/:id/move', [SeriesController, 'movePhoto'])

    // 3D Visualization endpoints
    router.post('/api/3d/photos', [ThreeDViewController, 'get3DPhotos'])
    router.get('/api/3d/categories', [ThreeDViewController, 'getAvailableCategories'])

    // Portfolio Review endpoints
    // router.get('/api/portfolio-review/:reviewType', [PortfolioReviewController, 'getPatterns'])
    router.get('/api/portfolio-review/should-build', [PortfolioReviewController, 'shouldBuild'])

    // Usage endpoints
    router.get('/api/usage', [UsageController, 'show'])
    router.get('/api/usage/base', [UsageController, 'base'])
    router.put('/api/usage', [UsageController, 'update'])
    router.post('/api/usage/credits/increment', [UsageController, 'incrementCredits'])
    router.get('/api/usage/can-upload', [UsageController, 'canUpload'])
    router.get('/api/usage/can-analyze', [UsageController, 'canAnalyze'])
    router.post('/api/usage/check-credits', [UsageController, 'checkCredits'])

    // Download photos endpoint
    router.post('/download-photo', async ({ request, response }) => {
      const ids = request.input('ids')

      if (!Array.isArray(ids) || ids.length === 0) {
        return response.badRequest('Missing ids')
      }

      // Buscar las fotos en la BD y verificar que pertenecen al usuario
      const photos = await Photo.query().whereIn('id', ids)

      if (photos.length === 0) {
        return response.badRequest('No photos found for given ids')
      }

      // Si es solo una foto
      if (photos.length === 1) {
        const photo = photos[0]
        try {
          const imgResponse = await axios.get(photo.originalUrl, { responseType: 'stream' })
          const filename = photo.originalFileName || 'photo.jpg'

          // CORS headers
          response.header('Access-Control-Allow-Origin', '*')
          response.header('Access-Control-Expose-Headers', 'Content-Disposition')

          response.header('Content-Disposition', `attachment; filename="${filename}"`)
          response.header(
            'Content-Type',
            imgResponse.headers['content-type'] || 'application/octet-stream'
          )
          return response.stream(imgResponse.data)
        } catch (err) {
          response.status(500).send('Error downloading image')
        }
        return
      }

      // Si son varias fotos
      // CORS headers
      response.header('Access-Control-Allow-Origin', '*')
      response.header('Access-Control-Expose-Headers', 'Content-Disposition')

      response.header('Content-Disposition', 'attachment; filename="photos.zip"')
      response.header('Content-Type', 'application/zip')

      const archive = archiver('zip', { zlib: { level: 9 } })
      archive.on('error', () => {
        response.status(500).send('Error creating zip')
      })

      // Stream the zip archive through AdonisJS response to preserve headers
      response.stream(archive)

      // Limitar concurrencia de descargas a 3 usando p-limit
      const limit = pLimit(3)
      await Promise.all(
        photos.map((photo, idx) =>
          limit(async () => {
            try {
              console.log(
                `[ZIP] Descargando foto ${idx + 1}/${photos.length}: ${photo.originalUrl}`
              )
              const imgResponse = await axios.get(photo.originalUrl, { responseType: 'stream' })
              const filename = photo.originalFileName || `photo_${idx + 1}.jpg`
              archive.append(imgResponse.data, { name: filename })
            } catch (err) {
              console.error(`[ZIP] Error descargando o agregando foto:`, err)
              // Si una imagen falla, la ignoramos
            }
          })
        )
      )
      console.log('[ZIP] Todas las fotos agregadas, finalizando zip...')
      archive.finalize()
      response.response.on('close', () => {
        console.log('[ZIP] Zip finalizado y enviado')
      })
      return
    })
  })
  .use([middleware.auth(), middleware.readOnly()]) // Apply auth and then readOnly middleware

// Protected LLM endpoints (require authentication + rate limiting)
router
  .group(() => {
    // Analyzer endpoints - AI-powered photo analysis
    router.post('/api/analyzer/', [AnalyzerController, 'analyze'])
    router.post('/api/embeddings/', [EmbeddingController, 'getEmbeddings'])

    // Semantic search endpoints - AI-powered search
    router.post('/api/search/semantic/stream', [SearchController, 'searchSemanticStream'])
    router.post('/api/search/semantic/sync', [SearchController, 'searchSemanticSync'])
    router.get('/api/catalog/photoInsight/:id?', [CatalogController, 'photoInsight'])
    router.post('/api/catalog/photoInsightSpecific/:id?', [
      CatalogController,
      'photoInsightSpecific',
    ])

    // Agentic chat endpoint (Langchain + GPT-5)
    router.post('/api/chat', [ChatController, 'chat'])
    router.get('/api/chat/reset', [ChatController, 'reset'])
  })
  .use([middleware.auth(), middleware.readOnly(), middleware.llmRateLimit()]) // Apply auth, readOnly and LLM rate limiting
