// Google Analytics 4 Configuration and Utilities

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

// Get GA4 Measurement ID from environment variable
const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID || "G-WK7N5SVNVD";

const ADMIN_PATH_PREFIX = "/admin";

// Check if we're in development
const isDevelopment = import.meta.env.DEV;

function isAdminPath(path: string): boolean {
  return path === ADMIN_PATH_PREFIX || path.startsWith(`${ADMIN_PATH_PREFIX}/`);
}

function shouldTrackAnalytics(
  path: string = window.location.pathname,
): boolean {
  return !isAdminPath(path);
}

// Initialize Google Analytics
export function initGA(): void {
  // Skip GA in development if you prefer
  // Uncomment the next 3 lines to disable GA in development:
  if (isDevelopment) {
    console.log("🔧 Google Analytics disabled in development mode");
    return;
  }

  if (!shouldTrackAnalytics()) {
    console.log("🔧 Google Analytics disabled on admin routes");
    return;
  }

  console.log(`🔍 Initializing Google Analytics with ID: ${GA_MEASUREMENT_ID}`);
  console.log(`🔧 Development mode: ${isDevelopment}`);

  // Load gtag script
  const script1 = document.createElement("script");
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script1);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    // Enhanced measurement settings
    page_title: document.title,
    page_location: window.location.href,
    send_page_view: false,
    // Privacy settings
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // Mark development traffic
    custom_map: {
      custom_parameter_1: "environment",
    },
    // Add environment context
    environment: isDevelopment ? "development" : "production",
  });

  // Send a test event to verify GA is working
  setTimeout(() => {
    if (typeof window.gtag !== "undefined") {
      window.gtag("event", "ga_initialized", {
        environment: isDevelopment ? "development" : "production",
        timestamp: new Date().toISOString(),
      });
      console.log("✅ Google Analytics initialized successfully");
    } else {
      console.log("❌ Google Analytics failed to initialize");
    }
  }, 2000);
}

// Track page views
export function trackPageView(path: string, title: string): void {
  if (!shouldTrackAnalytics(path)) {
    return;
  }

  if (typeof window.gtag !== "undefined") {
    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: path,
      page_title: title,
    });
    console.log(`📄 Page view tracked: ${path} (${title})`);
  }
}

// Track custom events
export function trackEvent(
  eventName: string,
  parameters: Record<string, any> = {},
): void {
  if (!shouldTrackAnalytics()) {
    return;
  }

  if (typeof window.gtag !== "undefined") {
    // Add environment to all events
    const enhancedParams = {
      ...parameters,
      environment: isDevelopment ? "development" : "production",
    };

    window.gtag("event", eventName, enhancedParams);
    console.log(`📊 Event tracked: ${eventName}`, enhancedParams);
  }
}

// Track specific events for your app
export function trackUserAction(
  action: string,
  section: string,
  value: any = null,
): void {
  trackEvent("user_action", {
    action_name: action,
    section: section,
    value: value,
  });
}

// Track authentication events
export function trackAuth(action: string, method: string | null = null): void {
  trackEvent("auth_action", {
    action: action, // 'login', 'signup', 'logout'
    method: method, // 'email', 'google', etc.
  });
}

// Track photo operations
export function trackPhotoEvent(
  action: string,
  count: number | null = null,
): void {
  trackEvent("photo_action", {
    action: action, // 'upload', 'analyze', 'download', etc.
    photo_count: count,
  });
}

// Track canvas/tool usage
export function trackToolUsage(tool: string, action: string): void {
  trackEvent("tool_usage", {
    tool_name: tool, // 'canvas', 'framer', 'search', etc.
    action: action, // 'open', 'use', 'complete'
  });
}
