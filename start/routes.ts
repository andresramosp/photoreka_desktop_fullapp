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
router
  .group(() => {
    router.post('/api/invites/generate', [InvitesController, 'generateInvite'])
    router.get('/api/invites', [InvitesController, 'listInvites'])
    router.post('/api/invites/send', [InvitesController, 'sendInvite'])
    router.post('/api/invites/send-grant', [InvitesController, 'sendGrant'])
  })
  .use(middleware.auth())

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
const CollectionSetsController = () => import('#controllers/collection_sets_controller')
const SeriesController = () => import('#controllers/series_controller')
const UsageController = () => import('#controllers/usage_controller')
const ThreeDViewController = () => import('#controllers/3dview_controller')
const TagCloudController = () => import('#controllers/tagcloud_controller')
const PortfolioReviewController = () => import('#controllers/portfolio_review_controller')
const ChatController = () => import('#controllers/chat_controller')
const CanvasController = () => import('#controllers/canvas_controller')
const PaymentController = () => import('#controllers/payment_controller')
const PortfolioBuildController = () => import('#controllers/portfolio_build_controller')

// Stripe webhook (no auth — verified by signature)
router.post('/api/payments/webhook', [PaymentController, 'webhook'])

// Payment packages (public — needed before auth for landing page)
router.get('/api/payments/packages', [PaymentController, 'packages'])

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
    router.post('/api/catalog/checkExactDuplicates', [CatalogController, 'checkExactDuplicates'])
    router.post('/api/catalog/deleteDuplicates', [CatalogController, 'deleteDuplicates'])

    router.post('/api/catalog/:id/note', [CatalogController, 'savePhotoNote'])
    router.post('/api/catalog/swapPhotos', [CatalogController, 'swapPhotos'])

    router.get('/api/analyzer-process', [AnalyzerProcessController, 'getAll'])
    router.get('/api/analyzer-process/:id', [AnalyzerProcessController, 'getById'])

    router.post('/api/search/semantic/sync', [SearchController, 'searchSemanticSync'])
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
    router.patch('/api/collections/move', [CollectionSetsController, 'moveCollection'])

    // Collection Sets endpoints
    router.get('/api/collection-sets', [CollectionSetsController, 'index'])
    router.get('/api/collection-sets/:id', [CollectionSetsController, 'show'])
    router.post('/api/collection-sets', [CollectionSetsController, 'store'])
    router.put('/api/collection-sets/:id', [CollectionSetsController, 'update'])
    router.delete('/api/collection-sets/:id', [CollectionSetsController, 'destroy'])

    // Canvas endpoints
    router.get('/api/canvas', [CanvasController, 'index'])
    router.post('/api/canvas', [CanvasController, 'store'])
    router.get('/api/canvas/:id', [CanvasController, 'show'])
    router.put('/api/canvas/:id', [CanvasController, 'update'])
    router.patch('/api/canvas/:id', [CanvasController, 'rename'])
    router.delete('/api/canvas/:id', [CanvasController, 'destroy'])

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

    // Tag Cloud (2D semantic visualization of user's tags)
    router.post('/api/tagcloud/2d', [TagCloudController, 'get2DTags'])

    // Portfolio Review endpoints
    // router.get('/api/portfolio-review/:reviewType', [PortfolioReviewController, 'getPatterns'])
    router.get('/api/portfolio-review/should-build', [PortfolioReviewController, 'shouldBuild'])

    // Portfolio Builder endpoints
    router.post('/api/portfolio-build/start', [PortfolioBuildController, 'start'])
    router.post('/api/portfolio-build/manual', [PortfolioBuildController, 'createManual'])
    router.post('/api/portfolio-build/preview-style-weights', [
      PortfolioBuildController,
      'previewStyleWeights',
    ])
    router.get('/api/portfolio-build/estimate-credits', [
      PortfolioBuildController,
      'estimateCredits',
    ])
    router.get('/api/portfolio-build/default-weights', [
      PortfolioBuildController,
      'getDefaultWeights',
    ])
    router.get('/api/portfolio-build/eligibility', [PortfolioBuildController, 'eligibility'])
    router.get('/api/portfolio-build/list', [PortfolioBuildController, 'list'])
    router.get('/api/portfolio-build/:id', [PortfolioBuildController, 'getStatus'])
    router.post('/api/portfolio-build/:id/abort', [PortfolioBuildController, 'abort'])
    router.delete('/api/portfolio-build/:id', [PortfolioBuildController, 'delete'])
    router.patch('/api/portfolio-build/:id/layout', [PortfolioBuildController, 'updateLayout'])

    // Payment endpoints
    router.post('/api/payments/checkout', [PaymentController, 'checkout'])
    router.get('/api/payments/history', [PaymentController, 'history'])
    router.get('/api/payments/verify', [PaymentController, 'verify'])

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

      const sharp = (await import('sharp')).default

      const downloadImageBuffer = async (url: string) => {
        const imgResponse = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 30_000,
        })

        return Buffer.from(imgResponse.data)
      }

      const toJpgName = (name: string, fallback = 'photo.jpg') => {
        const base = (name || fallback).replace(/\.[^.]+$/, '')
        return `${base}.jpg`
      }

      // Si es solo una foto
      if (photos.length === 1) {
        const photo = photos[0]

        try {
          const imageBuffer = await downloadImageBuffer(photo.originalUrl)

          const jpegBuffer = await sharp(imageBuffer)
            .jpeg({
              quality: 90,
              mozjpeg: true,
              chromaSubsampling: '4:4:4',
            })
            .toBuffer()

          const filename = toJpgName(photo.originalFileName)

          // CORS headers
          response.header('Access-Control-Allow-Origin', '*')
          response.header('Access-Control-Expose-Headers', 'Content-Disposition')

          response.header('Content-Disposition', `attachment; filename="${filename}"`)
          response.header('Content-Type', 'image/jpeg')
          response.header('Content-Length', jpegBuffer.length)

          return response.send(jpegBuffer)
        } catch (err) {
          console.error(err)
          return response.status(500).send('Error downloading image')
        }
      }

      // Si son varias fotos
      response.header('Access-Control-Allow-Origin', '*')
      response.header('Access-Control-Expose-Headers', 'Content-Disposition')

      response.header('Content-Disposition', 'attachment; filename="photos.zip"')
      response.header('Content-Type', 'application/zip')

      const rawResponse = response.response
      const archive = archiver('zip', {
        zlib: { level: 9 },
      })

      let clientDisconnected = false
      const zipSent = new Promise<void>((resolve, reject) => {
        rawResponse.once('finish', resolve)
        rawResponse.once('close', () => {
          if (!rawResponse.writableFinished) {
            clientDisconnected = true
            archive.abort()
          }

          resolve()
        })
        rawResponse.once('error', reject)
      })

      archive.on('error', (err) => {
        console.error(err)

        if (!rawResponse.headersSent) {
          response.status(500).send('Error creating zip')
          return
        }

        rawResponse.destroy(err)
      })

      response.relayHeaders()
      archive.pipe(rawResponse)

      // Limitar concurrencia
      const limit = pLimit(3)

      await Promise.all(
        photos.map((photo, idx) =>
          limit(async () => {
            if (clientDisconnected) {
              return
            }

            try {
              console.log(`[ZIP] Procesando foto ${idx + 1}/${photos.length}: ${photo.originalUrl}`)

              const imageBuffer = await downloadImageBuffer(photo.originalUrl)

              const jpegBuffer = await sharp(imageBuffer)
                .jpeg({
                  quality: 90,
                  mozjpeg: true,
                  chromaSubsampling: '4:4:4',
                })
                .toBuffer()

              const filename = toJpgName(photo.originalFileName, `photo_${idx + 1}.jpg`)

              archive.append(jpegBuffer, { name: filename })
            } catch (err) {
              console.error(`[ZIP] Error convirtiendo/agregando foto:`, err)
              // Si una falla, se ignora
            }
          })
        )
      )

      if (clientDisconnected) {
        return
      }

      console.log('[ZIP] Todas las fotos agregadas, finalizando zip...')
      await archive.finalize()

      await zipSent
      console.log('[ZIP] Zip finalizado y enviado')

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
    router.get('/api/catalog/photoInsight/:id?', [CatalogController, 'photoInsight'])
    router.post('/api/catalog/photoInsightSpecific/:id?', [
      CatalogController,
      'photoInsightSpecific',
    ])
  })
  .use([middleware.auth(), middleware.readOnly(), middleware.llmRateLimit()]) // Apply auth, readOnly and LLM rate limiting

// ==========================================
// Admin Backoffice Routes
// ==========================================
const AuthAdminController = () => import('#controllers/admin/auth_admin_controller')

// Admin auth (no middleware - login endpoint)
router.post('/api/admin/auth/login', [AuthAdminController, 'login'])

// Admin protected routes
const DashboardAdminController = () => import('#controllers/admin/dashboard_admin_controller')
const UsersAdminController = () => import('#controllers/admin/users_admin_controller')
const ProcessesAdminController = () => import('#controllers/admin/processes_admin_controller')
const HealthAdminController = () => import('#controllers/admin/health_admin_controller')
const CostsAdminController = () => import('#controllers/admin/costs_admin_controller')

router
  .group(() => {
    router.get('/api/admin/auth/profile', [AuthAdminController, 'profile'])
    router.post('/api/admin/auth/logout', [AuthAdminController, 'logout'])

    // Admin Dashboard
    router.get('/api/admin/dashboard', [DashboardAdminController, 'overview'])

    // Admin Users management
    router.get('/api/admin/users', [UsersAdminController, 'index'])
    router.get('/api/admin/users/:id', [UsersAdminController, 'show'])
    router.patch('/api/admin/users/:id/toggle-active', [UsersAdminController, 'toggleActive'])
    router.delete('/api/admin/users/:id', [UsersAdminController, 'destroy'])
    router.put('/api/admin/users/:id/usage', [UsersAdminController, 'updateUsage'])
    router.get('/api/admin/users/:id/activities', [UsersAdminController, 'activities'])
    router.get('/api/admin/activities', [UsersAdminController, 'globalActivities'])

    // Admin Processes management
    router.get('/api/admin/processes', [ProcessesAdminController, 'index'])
    router.get('/api/admin/processes/:id', [ProcessesAdminController, 'show'])
    router.post('/api/admin/processes/:id/health', [ProcessesAdminController, 'healthCheck'])
    router.post('/api/admin/processes/:id/retry', [ProcessesAdminController, 'retry'])

    // Admin Health dashboard
    router.get('/api/admin/health/overview', [HealthAdminController, 'overview'])

    // Admin Costs dashboard
    router.get('/api/admin/costs/overview', [CostsAdminController, 'overview'])
    router.post('/api/admin/health/users/:id/check', [HealthAdminController, 'userCheck'])
    router.post('/api/admin/health/users/:id/retry', [HealthAdminController, 'userRetry'])
    router.get('/api/admin/health/global-embeddings', [
      HealthAdminController,
      'globalEmbeddingsStatus',
    ])
    router.post('/api/admin/health/global-embeddings/run', [
      HealthAdminController,
      'runGlobalEmbeddings',
    ])
    router.get('/api/admin/health/global-clip', [HealthAdminController, 'globalClipStatus'])
    router.post('/api/admin/health/global-clip/run', [
      HealthAdminController,
      'runGlobalClipEmbeddings',
    ])
    router.get('/api/admin/health/tasks', [HealthAdminController, 'activeTasks'])
  })
  .use([middleware.auth(), middleware.admin()])

// Chat reset endpoint - no rate limiting
router
  .group(() => {
    router.get('/api/chat/reset', [ChatController, 'reset'])
    router.get('/api/chat/modes', [ChatController, 'listModes'])

    // Conversation management endpoints
    router.get('/api/conversations', [ChatController, 'listConversations'])
    router.get('/api/conversations/:id', [ChatController, 'getConversation'])
    router.patch('/api/conversations/:id', [ChatController, 'updateConversation'])
    router.delete('/api/conversations/:id', [ChatController, 'deleteConversation'])
  })
  .use([middleware.auth(), middleware.readOnly()])

// Chat endpoints - separate group with stricter rate limiting
router
  .group(() => {
    router.post('/api/chat', [ChatController, 'chat'])
  })
  .use([
    middleware.auth(),
    middleware.readOnly(),
    middleware.llmRateLimit({
      perMinute: 3,
      perHour: 10,
      perDay: 15,
      perMonth: 100,
      keyPrefix: 'chat',
    }),
  ])
