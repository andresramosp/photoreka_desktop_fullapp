import { createRouter, createWebHistory } from "vue-router";
import AppInitLoader from "../components/AppInitLoader.vue";
import { useUserStore } from "../stores/userStore";
import { useMaintenanceMode } from "../composables/useMaintenanceMode";
import { trackPageView } from "../utils/analytics";
import DashboardView from "../views/DashboardView.vue";
import CanvasView from "../views/CanvasView.vue";
import SearchView from "../views/SearchView.vue";
import CollectionsView from "../views/CollectionsView.vue";
import SeriesView from "../views/SeriesView.vue";
import SyncAreaView from "../views/SyncAreaView.vue";
import WorkspaceView from "../views/WorkspaceView.vue";
import ProjectBuilderView from "../views/ProjectBuilderView.vue";
import FramerView from "../views/FramerView.vue";
import PortfolioReportView from "../views/PortfolioReportView.vue";
import SettingsView from "../views/SettingsView.vue";
import HelpView from "../views/HelpView.vue";
import PlanView from "../views/PlanView.vue";
import AuthView from "../views/AuthView.vue";
import ProfileSelectionView from "../views/ProfileSelectionView.vue";
import StoragePlanSelectionView from "../views/StoragePlanSelectionView.vue";
import GridMaker from "../views/GridMakerView.vue";
import ChatView from "../views/ChatView.vue";
// import LandingView from "../views/LandingView.vue";
import LandingViewPremium from "../views/LandingViewPremium.vue";
import TermsView from "../views/TermsView.vue";
import MaintenanceView from "../views/MaintenanceView.vue";
import ThreeDView from "../views/3DView.vue";
import TwoDView from "../views/2DView.vue";
import WorldMapView from "../views/WorldMapView.vue";
import ResetPasswordView from "../views/ResetPasswordView.vue";
import ConfirmEmailView from "../views/ConfirmEmailView.vue";
import AuthCallback from "../views/AuthCallback.vue";
import AuthError from "../views/AuthError.vue";

// Admin views
// NOTE: AdminLoginView kept as layout reference for a potential standalone admin domain
// import AdminLoginView from "../views/admin/AdminLoginView.vue";
import AdminLayout from "../views/admin/AdminLayout.vue";
import AdminDashboardView from "../views/admin/AdminDashboardView.vue";
import AdminProcessesView from "../views/admin/AdminProcessesView.vue";
import AdminUsersView from "../views/admin/AdminUsersView.vue";
import AdminCostsView from "../views/admin/AdminCostsView.vue";
import AdminHealthView from "../views/admin/AdminHealthView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: AppInitLoader,
    },
    // Landing page moved to separate app
    // {
    //   path: "/",
    //   name: "landing",
    //   component: LandingViewPremium,
    //   meta: {
    //     requiresGuest: false,
    //     title: "Photoreka - Curation Lab",
    //     description:
    //       "Organize and curate your photo library with advanced tools. Search photos using natural language, arrange them on the canvas, and discover related images based on narrative or color similarity. Rank your photos by aesthetic scores and navigate your catalog in 3D.",
    //     keywords:
    //       "photo enhancement, AI photo tools, canvas maker, photo frames, image editor, photo culling, photo organizer",
    //   },
    // },

    {
      path: "/maintenance",
      name: "maintenance",
      component: MaintenanceView,
      meta: {
        requiresGuest: false, // Accessible to everyone
        layout: false, // Use standalone layout
      },
    },
    {
      path: "/terms",
      name: "terms",
      component: TermsView,
      meta: {
        requiresGuest: false, // Accessible to both guests and authenticated users
        layout: false, // Use standalone layout like landing page
        title: "Terms of Service - Photoreka",
        description:
          "Read Photoreka's terms of service and user agreement for our AI photo enhancement platform.",
        keywords: "terms of service, privacy policy, user agreement, Photoreka",
      },
    },

    {
      path: "/auth",
      name: "auth",
      component: AuthView,
      meta: {
        requiresGuest: true,
      },
    },

    {
      path: "/reset-password",
      name: "reset-password",
      component: ResetPasswordView,
      meta: {
        requiresGuest: false, // Accessible to both guests and authenticated users
        layout: false, // Use standalone layout like auth
      },
    },

    {
      path: "/confirm-email",
      name: "confirm-email",
      component: ConfirmEmailView,
      meta: {
        requiresGuest: false, // Accessible to both guests and authenticated users
        layout: false, // Use standalone layout like auth
      },
    },

    {
      path: "/auth/callback",
      name: "auth-callback",
      component: AuthCallback,
      meta: {
        requiresGuest: false, // Accessible during OAuth flow
        layout: false, // Use standalone layout
      },
    },

    {
      path: "/auth/error",
      name: "auth-error",
      component: AuthError,
      meta: {
        requiresGuest: false, // Accessible to show errors
        layout: false, // Use standalone layout
      },
    },

    {
      path: "/profile-setup",
      name: "profile-setup",
      component: ProfileSelectionView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/storage-plan-setup",
      name: "storage-plan-setup",
      component: StoragePlanSelectionView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: DashboardView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/canvas",
      name: "canvas",
      component: CanvasView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/canvas-playground",
      name: "canvas-playground",
      component: CanvasView,
      meta: {
        requiresGuest: false, // Accessible without authentication
        playground: true,
        title: "Free Canvas Playground - Photoreka",
        description:
          "Sequence and arrange your photos with Photoreka's canvas tool without registration. Find related images by narrative or color similarity and create stunning photo compositions.",
        keywords:
          "free canvas maker, photo playground, no registration photo editor, sequence photos, photo arrangement",
      },
    },
    {
      path: "/search",
      name: "search",
      component: SearchView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/collections",
      name: "collections",
      component: CollectionsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/collections/:id",
      name: "collection-detail",
      component: CollectionsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/series",
      name: "series",
      component: SeriesView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/series/:id",
      name: "series-detail",
      component: SeriesView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/shared-series/:userId/:serieName",
      name: "shared-series",
      component: SeriesView,
      meta: {
        requiresGuest: false, // Accessible without authentication
        playground: true,
        title: "Photo Series - Photoreka",
        description:
          "View a curated photo series. Browse through a sequential photo story in fullscreen mode.",
        keywords:
          "photo series, photo story, sequential photos, photo gallery, fullscreen viewer",
      },
    },
    {
      path: "/sync-area",
      name: "sync-area",
      component: SyncAreaView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/workspace",
      name: "workspace",
      component: WorkspaceView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/atlas",
      name: "atlas",
      component: ThreeDView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/world-map",
      name: "world-map",
      component: WorldMapView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/2d-view",
      name: "2d-view",
      component: TwoDView,
      meta: {
        requiresAuth: true,
      },
    },

    {
      path: "/3d-catalog/:userId",
      name: "3d-catalog",
      component: ThreeDView,
      meta: {
        requiresGuest: false, // Accessible without authentication
        playground: true,
        title: "3D Photo Catalog - Photoreka",
        description:
          "Explore photos in an immersive 3D space. Browse and navigate through photo collections in three dimensions.",
        keywords:
          "3D photo viewer, photo catalog, 3D gallery, immersive photo browsing",
      },
    },
    {
      path: "/shared-atlas/:userId",
      name: "shared-atlas",
      component: ThreeDView,
      meta: {
        requiresGuest: false, // Accessible without authentication
        playground: true,
        title: "3D Photo Catalog - Photoreka",
        description:
          "Explore photos in an immersive 3D space. Browse and navigate through photo collections in three dimensions.",
        keywords:
          "3D photo viewer, photo catalog, 3D gallery, immersive photo browsing",
      },
    },
    {
      path: "/project-builder",
      name: "project-builder",
      component: ProjectBuilderView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/framer",
      name: "framer",
      component: FramerView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/free-framer",
      name: "free-framer",
      component: FramerView,
      meta: {
        requiresGuest: false, // Accessible without authentication
        playground: true,
        title: "Free Photo Framer - Photoreka",
        description:
          "Create beautiful photo frames for free without registration. Design custom frames and borders for your photos with our easy-to-use framer tool.",
        keywords:
          "free photo frames, photo framer, custom photo borders, no registration photo tool",
      },
    },
    {
      path: "/report",
      name: "report",
      component: PortfolioReportView,
      meta: {
        requiresAuth: true,
      },
    },

    {
      path: "/grid-maker",
      name: "grid-maker",
      component: GridMaker,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/chat-lab",
      name: "chat-lab",
      component: ChatView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/help",
      name: "help",
      component: HelpView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/plan",
      name: "plan",
      component: PlanView,
      meta: {
        requiresAuth: true,
      },
    },

    // ==========================================
    // Admin Backoffice Routes
    // ==========================================
    // NOTE: /admin/login route removed — admin auth uses the main app auth flow.
    // AdminLoginView.vue is kept as reference in case admin is ever split to its own domain.
    {
      path: "/admin",
      component: AdminLayout,
      meta: { requiresAdmin: true, isAdmin: true },
      children: [
        {
          path: "",
          name: "admin-dashboard",
          component: AdminDashboardView,
        },
        {
          path: "processes",
          name: "admin-processes",
          component: AdminProcessesView,
        },
        {
          path: "users",
          name: "admin-users",
          component: AdminUsersView,
        },
        {
          path: "costs",
          name: "admin-costs",
          component: AdminCostsView,
        },
        {
          path: "health",
          name: "admin-health",
          component: AdminHealthView,
        },
      ],
    },
  ],
});

// Navigation guards
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore();
  const { shouldBlockRoute } = useMaintenanceMode();

  // Admin routes guard — reuses main app auth, checks role === 'admin'
  if (to.matched.some((r) => r.meta.requiresAdmin)) {
    if (!userStore.isInitialized) {
      await userStore.initAuth();
    }

    if (!userStore.isAuthenticated) {
      next({ path: "/auth", query: { redirect: to.fullPath } });
      return;
    }

    if (userStore.user?.role !== "admin") {
      next({ path: "/workspace" });
      return;
    }

    next();
    return;
  }

  // Manejar demo login silenciosamente
  if (to.path === "/demo") {
    const result = await userStore.demoLogin();
    if (result.success) {
      next("/workspace");
    } else {
      next("/auth");
    }
    return;
  }

  // Detectar y consumir token de handoff de Lightroom ANTES de cualquier otra verificación
  let handoffToken: string | null = null;
  let isFromHash = false;

  // 1. Buscar primero en query string normal
  if (to.query.lr_handoff && typeof to.query.lr_handoff === "string") {
    handoffToken = to.query.lr_handoff;
    isFromHash = false;
  }
  // 2. Si no está en query, buscar en el hash (formato: #catalog?lr_handoff=token)
  else if (to.hash && to.hash.includes("lr_handoff")) {
    const hashQueryMatch = to.hash.match(/\?(.*)/);
    if (hashQueryMatch) {
      const hashParams = new URLSearchParams(hashQueryMatch[1]);
      const tokenFromHash = hashParams.get("lr_handoff");
      if (tokenFromHash) {
        handoffToken = tokenFromHash;
        isFromHash = true;
      }
    }
  }

  // Si se detectó un token de handoff, procesarlo
  if (handoffToken) {
    try {
      const result = await userStore.consumeHandoff(handoffToken);

      if (result.success) {
        // Construir la nueva navegación sin el parámetro lr_handoff
        if (isFromHash) {
          // Limpiar lr_handoff del hash
          const hashQueryMatch = to.hash.match(/^(#[^?]*)\?(.*)/);
          let newHash = to.hash;

          if (hashQueryMatch) {
            const hashBase = hashQueryMatch[1];
            const hashParams = new URLSearchParams(hashQueryMatch[2]);
            hashParams.delete("lr_handoff");
            const remainingParams = hashParams.toString();
            newHash = remainingParams
              ? `${hashBase}?${remainingParams}`
              : hashBase;
          }

          next({
            path: to.path,
            query: to.query,
            hash: newHash,
            replace: true,
          });
        } else {
          // Limpiar lr_handoff de query
          const newQuery = { ...to.query };
          delete newQuery.lr_handoff;

          next({
            path: to.path,
            query: newQuery,
            hash: to.hash,
            replace: true,
          });
        }
        return;
      } else {
        console.error("Handoff authentication failed:", result.error);
      }
    } catch (error) {
      console.error("Error processing handoff token:", error);
    }
  }

  // Check if bypass is active via URL parameter or localStorage
  const urlBypass = to.query.isMe === "true";
  const storedBypass = localStorage.getItem("maintenance_bypass") === "true";

  // If URL has bypass parameter, save it to localStorage
  if (urlBypass) {
    localStorage.setItem("maintenance_bypass", "true");
  }

  // Has bypass if either URL parameter or localStorage says so
  const hasBypass = urlBypass || storedBypass;

  // If maintenance strict mode is enabled, redirect to maintenance page
  // except for exempt routes or if bypass is active
  if (shouldBlockRoute(to.name as string) && !hasBypass) {
    next("/maintenance");
    return;
  }

  // Check if route requires authentication
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    next("/auth");
    return;
  }

  next();
});

// Track page views after navigation
router.afterEach((to) => {
  // Update document title
  const pageTitle = (to.meta?.title as string) || "Photoreka";
  document.title = pageTitle;

  // Update meta description
  const description =
    (to.meta?.description as string) ||
    "Organize and curate your photo library with advanced tools. Search photos using natural language, arrange them on the canvas, and discover related images based on narrative or color similarity. Rank your photos by aesthetic scores and navigate your catalog in 3D.";
  updateMetaTag("name", "description", description);

  // Update meta keywords
  const keywords =
    (to.meta?.keywords as string) ||
    "photo enhancement, AI photo tools, canvas maker, photo frames, image editor";
  updateMetaTag("name", "keywords", keywords);

  // Update Open Graph tags
  updateMetaTag("property", "og:title", pageTitle);
  updateMetaTag("property", "og:description", description);
  updateMetaTag("property", "og:url", `https://photoreka.com${to.fullPath}`);

  // Update Twitter tags
  updateMetaTag("property", "twitter:title", pageTitle);
  updateMetaTag("property", "twitter:description", description);
  updateMetaTag(
    "property",
    "twitter:url",
    `https://photoreka.com${to.fullPath}`,
  );

  // Update canonical URL
  updateCanonicalUrl(`https://photoreka.com${to.fullPath}`);

  // Track page view with GA4
  trackPageView(to.fullPath, pageTitle);
});

// Helper function to update meta tags
function updateMetaTag(attribute: string, value: string, content: string) {
  let element = document.querySelector(
    `meta[${attribute}="${value}"]`,
  ) as HTMLMetaElement;
  if (element) {
    element.content = content;
  } else {
    element = document.createElement("meta");
    element.setAttribute(attribute, value);
    element.content = content;
    document.getElementsByTagName("head")[0].appendChild(element);
  }
}

// Helper function to update canonical URL
function updateCanonicalUrl(url: string) {
  let canonical = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement;
  if (canonical) {
    canonical.href = url;
  } else {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = url;
    document.getElementsByTagName("head")[0].appendChild(canonical);
  }
}

export default router;
