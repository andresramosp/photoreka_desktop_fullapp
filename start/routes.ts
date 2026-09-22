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
const WeightPresetsController = () => import('#controllers/weight_presets_controller')
router.post('/api/auth/register', [AuthController, 'register'])
router.post('/api/auth/login', [AuthController, 'login'])
router.post('/api/auth/demo-login', [AuthController, 'demoLogin']) // Demo login endpoint
router.post('/api/auth/demo-login/:variant', [AuthController, 'demoLogin']) // Demo variants (commercial…)
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
    router.delete('/api/account', [AuthController, 'deleteAccount'])
    // Custom weight presets
    router.get('/api/user/weight-presets', [WeightPresetsController, 'index'])
    router.post('/api/user/weight-presets', [WeightPresetsController, 'store'])
    router.patch('/api/user/weight-presets/:id', [WeightPresetsController, 'update'])
    router.delete('/api/user/weight-presets/:id', [WeightPresetsController, 'destroy'])
  })
  .use(middleware.auth())

// Email routes (require authentication)
const EmailController = () => import('#controllers/email_controller')
router
  .group(() => {
    router.post('/api/email/quota-request', [EmailController, 'sendQuotaRequest'])
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
    router.post('/api/auth_lr/complete-device-session', [AuthLrController, 'completeDeviceSession'])
  })
  .use(middleware.auth())

router.post('/api/auth_lr/consume-handoff', [AuthLrController, 'consumeHandoff'])
router.post('/api/auth_lr/create-device-session', [AuthLrController, 'createDeviceSession'])
router.get('/api/auth_lr/poll-device-session', [AuthLrController, 'pollDeviceSession'])

const AnalyzerController = () => import('#controllers/analyzer_controller')
const CatalogController = () => import('#controllers/catalog_controller')
const SearchController = () => import('#controllers/search_controller')
const TagsController = () => import('#controllers/tags_controller')
const EmbeddingController = () => import('#controllers/embeddings_controller')
const LandingController = () => import('#controllers/landing_controller')
const CollectionsController = () => import('#controllers/collections_controller')
const CollectionSetsController = () => import('#controllers/collection_sets_controller')
const SeriesController = () => import('#controllers/series_controller')
const SeriesSetsController = () => import('#controllers/series_sets_controller')
const UsageController = () => import('#controllers/usage_controller')
const ThreeDViewController = () => import('#controllers/3dview_controller')
const TagCloudController = () => import('#controllers/tagcloud_controller')
const ReportReviewController = () => import('#controllers/report_review_controller')
const InsightsController = () => import('#controllers/insights_controller')
const ChatController = () => import('#controllers/chat_controller')
const CanvasController = () => import('#controllers/canvas_controller')
const SuggestedCanvasController = () => import('#controllers/suggested_canvas_controller')
const PaymentController = () => import('#controllers/payment_controller')
const PortfolioBuildController = () => import('#controllers/portfolio_build_controller')
const PortfolioBuildSetsController = () => import('#controllers/portfolio_build_sets_controller')
const PublicItemsController = () => import('#controllers/public_items_controller')
const AiLocationInferenceController = () => import('#controllers/ai_location_inference_controller')
const GeocodingController = () => import('#controllers/geocoding_controller')
const SafeSearchController = () => import('#controllers/safe_search_controller')
const ActivityController = () => import('#controllers/activity_controller')
const GeoRecoveryController = () => import('#controllers/geo_recovery_controller')

// Stripe webhook (no auth — verified by signature)
router.post('/api/payments/webhook', [PaymentController, 'webhook'])

// Payment packages (public — needed before auth for landing page)
router.get('/api/payments/packages', [PaymentController, 'packages'])

// Landing page endpoints (no auth required)
router.post('/api/landing/waiting-list', [LandingController, 'waitingList'])

// Published pages, served at photoreka.com/:username[/:slug] (no auth required)
router.get('/api/public/:username', [PublicItemsController, 'showProfile'])
router.get('/api/public/:username/:slug', [PublicItemsController, 'showItem'])

// 3D Visualization public endpoint (no auth required)
router.post('/api/3d/catalog/:id', [ThreeDViewController, 'get3DPhotosByIdOrUsername'])

// Report Review public endpoint (no auth required)
router.get('/api/report-review/:reviewType/user/:userId', [
  ReportReviewController,
  'getPatternsByUserId',
])

// Geo Recovery (anonymous one-shot product — auth via signed session token in headers)
router.post('/api/geo-recovery/assess', [GeoRecoveryController, 'assess'])
router.post('/api/geo-recovery/session', [GeoRecoveryController, 'createSession'])
router.post('/api/geo-recovery/free-session', [GeoRecoveryController, 'freeSession'])
router.post('/api/geo-recovery/upload-url', [GeoRecoveryController, 'getUploadUrl'])
router.post('/api/geo-recovery/photos', [GeoRecoveryController, 'registerPhotos'])
router.post('/api/geo-recovery/payment-intent', [GeoRecoveryController, 'createPaymentIntent'])
router.get('/api/geo-recovery/price', [GeoRecoveryController, 'price'])
router.post('/api/geo-recovery/confirm-payment', [GeoRecoveryController, 'confirmPayment'])
router.post('/api/geo-recovery/start', [GeoRecoveryController, 'start'])
router.get('/api/geo-recovery/job', [GeoRecoveryController, 'job'])
router.post('/api/geo-recovery/geocoding/suggest', [GeoRecoveryController, 'geocodingSuggest'])
router.post('/api/geo-recovery/geocoding/retrieve', [GeoRecoveryController, 'geocodingRetrieve'])

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
    router.post('/api/catalog/confirmUpload', [CatalogController, 'confirmUpload'])
    router.post('/api/catalog/uploadFinished', [CatalogController, 'uploadFinished'])

    // Frontend activity logging
    router.post('/api/activity/log', [ActivityController, 'log'])

    // Content moderation
    router.post('/api/moderation/safe-search', [SafeSearchController, 'check'])

    router.post('/api/catalog/checkExactDuplicates', [CatalogController, 'checkExactDuplicates'])
    router.post('/api/catalog/checkSimilarDuplicates', [
      CatalogController,
      'checkSimilarDuplicates',
    ])
    router.post('/api/catalog/deleteDuplicates', [CatalogController, 'deleteDuplicates'])

    router.post('/api/catalog/:id/note', [CatalogController, 'savePhotoNote'])
    router.post('/api/catalog/:id/flag', [CatalogController, 'setPhotoFlag'])
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
    router.get('/api/tags/top', [TagsController, 'top'])
    router.get('/api/tags/treemap', [TagsController, 'treemap'])

    // Collections endpoints
    router.get('/api/collections', [CollectionsController, 'index'])
    router.get('/api/collections/:id', [CollectionsController, 'show'])
    router.post('/api/collections', [CollectionsController, 'store'])
    router.put('/api/collections/:id', [CollectionsController, 'update'])
    router.delete('/api/collections/:id', [CollectionsController, 'destroy'])
    router.delete('/api/collections', [CollectionsController, 'destroyMany'])
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
    router.post('/api/canvas/photos', [CanvasController, 'photosByIds'])
    router.post('/api/canvas/:id/duplicate', [CanvasController, 'duplicate'])
    router.get('/api/canvas/:id', [CanvasController, 'show'])
    router.put('/api/canvas/:id', [CanvasController, 'update'])
    router.patch('/api/canvas/:id', [CanvasController, 'rename'])
    router.delete('/api/canvas/:id', [CanvasController, 'destroy'])

    // Weekly moodboard seed for the dashboard
    router.get('/api/dashboard/suggested-canvas', [SuggestedCanvasController, 'show'])
    router.post('/api/dashboard/suggested-canvas/seen', [SuggestedCanvasController, 'seen'])
    router.post('/api/dashboard/suggested-canvas/opened', [SuggestedCanvasController, 'opened'])

    // Series endpoints
    router.get('/api/series', [SeriesController, 'index'])
    router.get('/api/series/:id', [SeriesController, 'show'])
    router.post('/api/series', [SeriesController, 'store'])
    router.put('/api/series/:id', [SeriesController, 'update'])
    router.delete('/api/series', [SeriesController, 'destroyMany'])
    router.delete('/api/series/:id', [SeriesController, 'destroy'])
    router.post('/api/series/:id/photos', [SeriesController, 'addPhotos'])
    router.delete('/api/series/:id/photos', [SeriesController, 'removePhotos'])
    router.put('/api/series/:id/order', [SeriesController, 'updateOrder'])
    router.put('/api/series/:id/move', [SeriesController, 'movePhoto'])
    router.patch('/api/series/move', [SeriesSetsController, 'moveSeries'])

    // Series Sets endpoints
    router.get('/api/series-sets', [SeriesSetsController, 'index'])
    router.get('/api/series-sets/:id', [SeriesSetsController, 'show'])
    router.post('/api/series-sets', [SeriesSetsController, 'store'])
    router.put('/api/series-sets/:id', [SeriesSetsController, 'update'])
    router.delete('/api/series-sets/:id', [SeriesSetsController, 'destroy'])

    // 3D Visualization endpoints
    router.post('/api/3d/photos', [ThreeDViewController, 'get3DPhotos'])
    router.get('/api/3d/categories', [ThreeDViewController, 'getAvailableCategories'])
    router.post('/api/3d/cluster', [ThreeDViewController, 'clusterPhotos'])

    // Tag Cloud (2D semantic visualization of user's tags)
    router.post('/api/tagcloud/2d', [TagCloudController, 'get2DTags'])

    // Report Review endpoints
    // router.get('/api/report-review/:reviewType', [ReportReviewController, 'getPatterns'])
    router.get('/api/report-review/should-build', [ReportReviewController, 'shouldBuild'])

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
    router.delete('/api/portfolio-build', [PortfolioBuildController, 'deleteMany'])
    router.patch('/api/portfolio-build/move', [PortfolioBuildSetsController, 'moveBuild'])
    router.get('/api/portfolio-build/:id', [PortfolioBuildController, 'getStatus'])
    router.post('/api/portfolio-build/:id/abort', [PortfolioBuildController, 'abort'])
    router.delete('/api/portfolio-build/:id', [PortfolioBuildController, 'delete'])
    router.patch('/api/portfolio-build/:id/layout', [PortfolioBuildController, 'updateLayout'])

    router.get('/api/location-inference/summary', [AiLocationInferenceController, 'summary'])
    router.post('/api/location-inference/start', [AiLocationInferenceController, 'start'])

    // Geocoding autocomplete (Mapbox Search Box) + location correction
    router.post('/api/geocoding/suggest', [GeocodingController, 'suggest'])
    router.post('/api/geocoding/retrieve', [GeocodingController, 'retrieve'])
    router.patch('/api/photos/:id/location', [GeocodingController, 'updatePhotoLocation'])

    // Portfolio Sets endpoints
    router.get('/api/portfolio-build-sets', [PortfolioBuildSetsController, 'index'])
    router.get('/api/portfolio-build-sets/:id', [PortfolioBuildSetsController, 'show'])
    router.post('/api/portfolio-build-sets', [PortfolioBuildSetsController, 'store'])
    router.put('/api/portfolio-build-sets/:id', [PortfolioBuildSetsController, 'update'])
    router.delete('/api/portfolio-build-sets/:id', [PortfolioBuildSetsController, 'destroy'])

    // Publishing endpoints
    router.get('/api/public-items', [PublicItemsController, 'index'])
    router.post('/api/public-items', [PublicItemsController, 'store'])
    router.delete('/api/public-items/:id', [PublicItemsController, 'destroy'])
    router.put('/api/me/username', [PublicItemsController, 'claimUsername'])

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
        const base = (name || fallback)
          .replace(/\.[^.]+$/, '')
          .replace(/[^\p{L}\p{N} ._-]/gu, '_')
          .trim()

        return `${base || 'photo'}.jpg`
      }

      // Node rechaza valores de header fuera de latin-1 y writeHead corre fuera
      // del try/catch del handler, así que un nombre con emoji o CJK tumba el proceso
      const attachmentHeader = (filename: string) => {
        const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
        const encoded = encodeURIComponent(filename).replace(
          /['()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        )

        return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
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

          response.header('Content-Disposition', attachmentHeader(filename))
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
    router.get('/api/photoInsight/:id?', [InsightsController, 'photoInsight'])
    router.post('/api/photoInsightSpecific/:id?', [InsightsController, 'photoInsightSpecific'])
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
const PaymentsAdminController = () => import('#controllers/admin/payments_admin_controller')

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
    router.get('/api/admin/users/:id/photos', [UsersAdminController, 'photos'])
    router.post('/api/admin/users/:id/materialize-folders', [
      UsersAdminController,
      'materializeFolders',
    ])
    router.get('/api/admin/users/:id/deleted-photos', [UsersAdminController, 'deletedPhotos'])
    router.get('/api/admin/users/:id/credit-ledger', [UsersAdminController, 'creditLedger'])
    router.post('/api/admin/users/:id/mark-photos-reviewed', [
      UsersAdminController,
      'markPhotosReviewed',
    ])
    router.post('/api/admin/users/:id/restore-deleted-photos', [
      UsersAdminController,
      'restoreDeletedPhotos',
    ])
    router.get('/api/admin/activities', [UsersAdminController, 'globalActivities'])
    router.post('/api/admin/users/:id/impersonate', [UsersAdminController, 'impersonate'])
    router.post('/api/admin/users/:id/revoke-sessions', [UsersAdminController, 'revokeSessions'])

    // Admin Processes management
    router.get('/api/admin/processes', [ProcessesAdminController, 'index'])
    router.get('/api/admin/processes/pool', [ProcessesAdminController, 'poolStatus'])
    router.get('/api/admin/processes/:id', [ProcessesAdminController, 'show'])
    router.get('/api/admin/processes/:id/photos', [ProcessesAdminController, 'photos'])
    router.post('/api/admin/processes/:id/health', [ProcessesAdminController, 'healthCheck'])
    router.post('/api/admin/processes/:id/retry', [ProcessesAdminController, 'retry'])
    router.post('/api/admin/processes/:id/materialize', [ProcessesAdminController, 'materialize'])
    router.post('/api/admin/processes/:id/launch', [ProcessesAdminController, 'launch'])
    router.post('/api/admin/processes/:id/score-smoothing', [
      ProcessesAdminController,
      'scoreSmoothing',
    ])

    // Admin Health dashboard
    router.get('/api/admin/health/overview', [HealthAdminController, 'overview'])

    // Admin Costs dashboard
    router.get('/api/admin/costs/overview', [CostsAdminController, 'overview'])
    router.get('/api/admin/costs/transactions', [CostsAdminController, 'transactions'])

    // Admin Payments dashboard
    router.get('/api/admin/payments/overview', [PaymentsAdminController, 'overview'])
    router.get('/api/admin/payments', [PaymentsAdminController, 'index'])

    // Admin Geo-Recovery
    const GeoRecoveryAdminController = () =>
      import('#controllers/admin/geo_recovery_admin_controller')
    router.get('/api/admin/geo-recovery/stats', [GeoRecoveryAdminController, 'stats'])
    router.get('/api/admin/geo-recovery/sessions', [GeoRecoveryAdminController, 'sessions'])
    router.get('/api/admin/geo-recovery/analyses', [GeoRecoveryAdminController, 'analyses'])
    router.get('/api/admin/geo-recovery/payments', [GeoRecoveryAdminController, 'payments'])
    router.get('/api/admin/geo-recovery/cost-logs', [GeoRecoveryAdminController, 'costLogs'])
    router.post('/api/admin/geo-recovery/reset-free-runs', [
      GeoRecoveryAdminController,
      'resetFreeRuns',
    ])
    router.post('/api/admin/health/users/:id/check', [HealthAdminController, 'userCheck'])
    router.post('/api/admin/health/users/:id/image-check', [
      HealthAdminController,
      'userImageCheck',
    ])
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

    // Admin Score smoothing (regularización de scores artísticos por usuario)
    router.post('/api/admin/users/:id/score-smoothing', [
      HealthAdminController,
      'userScoreSmoothing',
    ])
    router.get('/api/admin/users/:id/score-smoothing', [
      HealthAdminController,
      'userScoreSmoothingReport',
    ])
    router.post('/api/admin/users/:id/score-smoothing/run', [
      HealthAdminController,
      'userScoreSmoothingRun',
    ])

    // Admin System management
    const SystemAdminController = () => import('#controllers/admin/system_admin_controller')
    router.post('/api/admin/system/cache/invalidate', [SystemAdminController, 'invalidateCache'])
    router.get('/api/admin/system/score-smoothing', [SystemAdminController, 'scoreSmoothingStatus'])
    router.post('/api/admin/system/score-smoothing/revert', [
      SystemAdminController,
      'revertScoreSmoothing',
    ])
  })
  .use([middleware.auth(), middleware.admin()])

// Chat reset endpoint - no rate limiting
router
  .group(() => {
    router.get('/api/chat/reset', [ChatController, 'reset'])
    router.get('/api/chat/modes', [ChatController, 'listModes'])

    // Phase 3 — grounded action suggestions for the latest assistant turn
    router.post('/api/chat/actions', [ChatController, 'chatActions'])
    router.post('/api/chat/actions/used', [ChatController, 'markChatActionUsed'])

    // Selection basket — persisted per conversation, written on every change
    router.post('/api/chat/basket', [ChatController, 'updateBasket'])

    // Curation mode — progressive exploration, persisted per conversation
    router.post('/api/chat/curation-mode', [ChatController, 'updateCurationMode'])

    // Canvas chats — the conversation docked to a board. Reset is a POST because the
    // demo read-only middleware blocks every DELETE outright.
    router.post('/api/chat/canvas-session/reset', [ChatController, 'resetCanvasSession'])
    router.get('/api/chat/canvas-session/:canvasId', [ChatController, 'getCanvasSession'])

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
    // middleware.llmRateLimit({
    //   perMinute: 5,
    //   perHour: 15,
    //   perDay: 40,
    //   perMonth: 200,
    //   keyPrefix: 'chat',
    // }),
  ])
