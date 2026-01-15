<template>
  <n-config-provider :theme="currentTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <!-- Maintenance Banner -->
      <MaintenanceBanner />

      <div class="premium-landing">
        <!-- Navigation Header -->
        <nav class="premium-nav">
          <div class="nav-container">
            <div class="nav-brand">
              <AppLogo
                :layout="isMobileDevice() ? 'horizontal' : 'horizontal'"
                size="small"
              />
            </div>
            <div class="nav-actions">
              <button
                v-if="canToggleTheme(true)"
                class="theme-toggle"
                @click="toggleTheme"
                aria-label="Toggle theme"
              >
                <n-icon size="20">
                  <component
                    :is="themeMode === 'dark' ? SunnyOutline : MoonOutline"
                  />
                </n-icon>
              </button>
              <n-button text @click="goToAuth('login')">Login</n-button>
              <n-button
                v-if="!isMobileDevice()"
                type="info"
                size="large"
                @click="goToAuth('signup')"
              >
                <template #icon>
                  <n-icon><RocketOutline /></n-icon>
                </template>
                Request Access
              </n-button>
            </div>
          </div>
        </nav>

        <!-- Hero Section -->
        <section class="hero-section" ref="heroSection">
          <div class="hero-background">
            <div class="gradient-orb orb-1"></div>
            <div class="gradient-orb orb-2"></div>
            <div class="gradient-orb orb-3"></div>
          </div>
          <div class="hero-container">
            <div class="hero-content">
              <div
                v-if="true"
                class="hero-badge"
                :class="{ visible: heroVisible }"
              >
                <span class="badge-content">
                  <n-icon size="16"><WalkOutline /></n-icon>Street
                  <n-icon size="16"><BookOpen16Regular /></n-icon>Documentary
                  <n-icon size="16"><PaletteOutlined /></n-icon>Artistic
                  <n-icon size="16"><PersonOutline /></n-icon>Portrait
                  <n-icon size="16"><ImageOutline /></n-icon>Landscape
                </span>
              </div>
              <h1 class="hero-title" :class="{ visible: heroVisible }">
                Make full sense of your
                <span class="gradient-text"> photographic body of work</span>
              </h1>

              <p class="hero-description" :class="{ visible: heroVisible }">
                <strong>Photoreka</strong> is a
                <strong>Curation Lab</strong> for photographers who care about
                their archive.<br />
                See how your images relate to each other and understand your
                work as a whole.
                <br />Search in natural language, create meaningful sequences,
                and explore your catalog in 3D.
              </p>
              <div
                v-if="false"
                class="hero-badge"
                :class="{ visible: heroVisible }"
              >
                <span class="badge-content">
                  <n-icon size="16"><WalkOutline /></n-icon>Street
                  <n-icon size="16"><BookOpen16Regular /></n-icon>Documentary
                  <n-icon size="16"><PaletteOutlined /></n-icon>Artistic
                  <n-icon size="16"><PersonOutline /></n-icon>Portrait
                  <n-icon size="16"><ImageOutline /></n-icon>Landscape
                </span>
              </div>
              <n-button type="info" size="large" @click="goToAuth('signup')">
                <template #icon>
                  <n-icon><RocketOutline /></n-icon>
                </template>
                Request Access
              </n-button>
              <!-- Video Demo Section -->
              <div class="hero-demo" :class="{ visible: heroVisible }">
                <div v-if="videoTabs.length > 1" class="demo-tabs">
                  <button
                    v-for="(tab, index) in videoTabs"
                    :key="index"
                    class="demo-tab"
                    :class="{ active: activeTab === index }"
                    @click="setActiveTab(index, false)"
                  >
                    <n-icon size="18">
                      <component :is="tab.icon" />
                    </n-icon>
                    <span>{{ tab.title }}</span>
                    <div class="tab-indicator" v-if="activeTab === index">
                      <div
                        class="progress"
                        :style="{ width: `${videoProgress}%` }"
                      ></div>
                    </div>
                  </button>
                </div>

                <div class="demo-video-container" ref="videoContainer">
                  <video
                    ref="videoPlayer"
                    class="demo-video"
                    :src="videoTabs[activeTab].videoUrl"
                    @timeupdate="updateProgress"
                    @ended="onVideoEnded"
                    @play="onVideoPlay"
                    @loadeddata="onVideoLoaded"
                    muted
                    preload="metadata"
                  ></video>
                  <div
                    class="video-play-overlay"
                    v-if="!videoPlaying"
                    @click="playVideo"
                  >
                    <div class="play-button">
                      <n-icon size="48" color="white">
                        <PlayCircleOutline />
                      </n-icon>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Free Tools Mini Banner -->
        <!-- <section class="tools-banner">
          <div class="banner-container">
            <span class="banner-label">Try our free tools</span>
            <div class="banner-buttons">
              <button class="tool-chip" @click="goToPlayground">
                <n-icon size="16"><Workspace /></n-icon>
                <span>Canvas</span>
              </button>
              <button class="tool-chip" @click="goToFreeFramer">
                <n-icon size="16"><StopOutline /></n-icon>
                <span>Framer</span>
              </button>
            </div>
          </div>
        </section> -->

        <!-- Features Section -->
        <section class="features-section" ref="featuresSection">
          <div class="section-container">
            <div class="section-header" :class="{ visible: featuresVisible }">
              <h2 class="section-title">Powerful features for photographers</h2>
              <p class="section-subtitle">
                Everything you need to organize and curate your photo collection
              </p>
            </div>

            <div class="features-grid">
              <div
                v-for="(feature, index) in features"
                :key="index"
                class="feature-card"
                :class="{ visible: featuresVisible }"
                :style="{ transitionDelay: `${index * 100}ms` }"
              >
                <div class="feature-icon" :style="{ color: feature.color }">
                  <n-icon size="32">
                    <component :is="feature.icon" />
                  </n-icon>
                </div>
                <h3 class="feature-title">{{ feature.title }}</h3>
                <p class="feature-description">{{ feature.description }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Lightroom Integration Section -->
        <section class="integration-section" ref="integrationSection">
          <div class="section-container">
            <div class="integration-layout">
              <div
                class="integration-visual"
                :class="{ visible: integrationVisible }"
              >
                <div class="video-frame">
                  <video
                    class="integration-video"
                    :src="lightroomVideoUrl"
                    @loadeddata="onLightroomVideoLoaded"
                    autoplay
                    muted
                    loop
                    playsinline
                  ></video>
                </div>
              </div>

              <div
                class="integration-content"
                :class="{ visible: integrationVisible }"
              >
                <div class="integration-badge">
                  <span>Official Plugin</span>
                </div>
                <div class="integration-header">
                  <img
                    src="/src/assets/logos/lightroom_logo.png"
                    alt="Adobe Lightroom"
                    class="integration-logo"
                  />
                  <h2 class="integration-title">Lightroom Integration</h2>
                </div>
                <p class="integration-description">
                  Seamlessly connect Photoreka with Adobe Lightroom Classic.
                  Sync your catalog, search by natural language directly from
                  Lightroom, and bring the power of intelligent curation to your
                  existing workflow.
                </p>

                <ul class="integration-features">
                  <li>
                    <div class="feature-icon-wrapper" style="color: #2563eb">
                      <n-icon size="18"><SyncOutline /></n-icon>
                    </div>
                    <span>Direct sync from Lightroom catalog</span>
                  </li>
                  <li>
                    <div class="feature-icon-wrapper" style="color: #8b5cf6">
                      <n-icon size="28"><ChatbubblesOutline /></n-icon>
                    </div>
                    <span>Search by natural language integrated</span>
                  </li>
                  <li>
                    <div class="feature-icon-wrapper" style="color: #f59e0b">
                      <n-icon size="18"><ShareSocialOutline /></n-icon>
                    </div>
                    <span>One-click photo transfer to Photoreka tools</span>
                  </li>
                  <li>
                    <div class="feature-icon-wrapper" style="color: #22c55e">
                      <n-icon size="18"><LinkOutline /></n-icon>
                    </div>
                    <span>Compatible with Photoreka web workflow</span>
                  </li>
                </ul>

                <div class="integration-cta">
                  <n-button
                    type="primary"
                    size="large"
                    @click="goToAuth('signup')"
                  >
                    <template #icon>
                      <n-icon><DownloadOutline /></n-icon>
                    </template>
                    Get the Plugin
                  </n-button>
                  <span class="cta-note">Free with Photoreka account</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Data Sources Section -->
        <section class="sources-section" ref="sourcesSection">
          <div class="section-container">
            <div class="section-header" :class="{ visible: sourcesVisible }">
              <h2 class="section-title">Connect your photos from anywhere</h2>
              <p class="section-subtitle">
                Photoreka works seamlessly with multiple photo sources. Import
                your images from wherever they live and start curating
                immediately.
              </p>
            </div>

            <div class="sources-grid">
              <div
                v-for="(source, index) in dataSources"
                :key="index"
                class="source-card"
                :class="{
                  visible: sourcesVisible,
                  'coming-soon': source.comingSoon,
                }"
                :style="{ transitionDelay: `${index * 100}ms` }"
              >
                <div class="source-icon">
                  <n-icon v-if="!source.logo" size="40" :color="source.color">
                    <component :is="source.icon" />
                  </n-icon>
                  <img
                    v-else
                    :src="source.logo"
                    :alt="source.name"
                    class="source-logo-img"
                  />
                </div>
                <h3 class="source-name">{{ source.name }}</h3>
                <p class="source-description">{{ source.description }}</p>
                <div
                  class="source-badge"
                  :class="{
                    available: !source.comingSoon,
                    soon: source.comingSoon,
                  }"
                >
                  {{ source.comingSoon ? "Coming Soon" : "Available Now" }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Free Tools Section -->
        <section class="free-tools-section" ref="freeToolsSection">
          <div class="section-container">
            <div class="section-header" :class="{ visible: freeToolsVisible }">
              <div class="tools-badge">
                <n-icon size="16"><Workspace /></n-icon>
                <span>Free Forever</span>
              </div>
              <h2 class="section-title">Try our free tools</h2>
              <p class="section-subtitle">
                No account needed. Start creating and experimenting right now
                with our professional-grade tools.
              </p>
            </div>

            <div class="tools-showcase" :class="{ visible: freeToolsVisible }">
              <!-- Free Framer Card -->
              <div class="tool-card tool-card-large tool-card-framer">
                <div class="tool-visual framer-visual">
                  <div class="tool-screenshot-wrapper">
                    <img
                      src="/src/assets/home/free_framer.png"
                      alt="Free Framer Screenshot"
                      class="tool-screenshot"
                    />
                  </div>
                </div>
                <div class="tool-card-content">
                  <div class="tool-header">
                    <div
                      class="tool-icon tool-icon-framer"
                      style="
                        background: linear-gradient(
                          135deg,
                          #f59e0b 0%,
                          #f97316 100%
                        );
                      "
                    >
                      <n-icon size="28"><StopOutline /></n-icon>
                    </div>
                    <div class="tool-meta">
                      <h3 class="tool-title">Free Framer</h3>
                      <span class="tool-tag">Photo Framing Tool</span>
                    </div>
                  </div>
                  <p class="tool-description">
                    Add professional frames and borders to your photos
                    instantly. Perfect for presentations, portfolios, and social
                    media. Choose from multiple styles and customize colors to
                    match your vision.
                  </p>
                  <ul class="tool-features">
                    <li>
                      <n-icon size="16"><ColorPaletteOutline /></n-icon>
                      <span>Multiple frame styles and borders</span>
                    </li>
                    <li>
                      <n-icon size="16"><ImagesOutline /></n-icon>
                      <span>Customizable colors and sizes</span>
                    </li>
                    <li>
                      <n-icon size="16"><DownloadOutline /></n-icon>
                      <span>Batch export photos without limits</span>
                    </li>
                  </ul>
                  <n-button
                    type="warning"
                    size="large"
                    @click="goToFreeFramer"
                    class="tool-cta"
                  >
                    <template #icon>
                      <n-icon><PlayCircleOutline /></n-icon>
                    </template>
                    Try Framer
                  </n-button>
                </div>
              </div>
              <!-- Canvas Playground Card -->
              <div class="tool-card tool-card-large">
                <div class="tool-card-content">
                  <div class="tool-header">
                    <div
                      class="tool-icon"
                      style="
                        background: linear-gradient(
                          135deg,
                          #8b5cf6 0%,
                          #6366f1 100%
                        );
                      "
                    >
                      <n-icon size="32"><Workspace /></n-icon>
                    </div>
                    <div class="tool-meta">
                      <h3 class="tool-title">Canvas Playground</h3>
                      <span class="tool-tag">Interactive Design Tool</span>
                    </div>
                  </div>
                  <p class="tool-description">
                    Create stunning photo layouts and compositions with complete
                    creative freedom. Drag, drop, and arrange your photos to
                    tell your visual story. With a Photoreka account, find
                    related images from your collection.
                  </p>
                  <ul class="tool-features">
                    <li>
                      <n-icon size="16"><ColorPaletteOutline /></n-icon>
                      <span>Drop unlimited images</span>
                    </li>
                    <li>
                      <n-icon size="16"><ImagesOutline /></n-icon>
                      <span
                        >Find images by narrative or chromatic similarity</span
                      >
                    </li>
                    <li>
                      <n-icon size="16"><DownloadOutline /></n-icon>
                      <span>Intuitive drag and drop interface</span>
                    </li>
                  </ul>
                  <n-button
                    type="primary"
                    size="large"
                    @click="goToPlayground"
                    class="tool-cta"
                  >
                    <template #icon>
                      <n-icon><PlayCircleOutline /></n-icon>
                    </template>
                    Launch Canvas
                  </n-button>
                </div>
                <div class="tool-visual canvas-visual">
                  <div class="tool-screenshot-wrapper">
                    <img
                      src="/src/assets/home/canvas_playground.png"
                      alt="Canvas Playground Screenshot"
                      class="tool-screenshot"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- FAQs Section -->
        <section class="faqs-section" ref="faqsSection">
          <div class="section-container">
            <div class="section-header" :class="{ visible: faqsVisible }">
              <h2 class="section-title">Frequently asked questions</h2>
              <p class="section-subtitle">
                Find answers to the most common questions about Photoreka
              </p>
            </div>

            <div class="faqs-container" :class="{ visible: faqsVisible }">
              <div
                v-for="(faq, index) in faqs"
                :key="index"
                class="faq-item"
                :class="{ active: activeFAQ === index }"
              >
                <button class="faq-question" @click="toggleFAQ(index)">
                  <span class="faq-q">{{ faq.question }}</span>
                  <n-icon
                    size="20"
                    class="faq-icon"
                    :class="{ rotated: activeFAQ === index }"
                  >
                    <ChevronDownOutline />
                  </n-icon>
                </button>
                <div class="faq-answer" v-show="activeFAQ === index">
                  <p v-if="faq.hasHtml" v-html="faq.answer"></p>
                  <p v-else-if="!faq.hasLink">{{ faq.answer }}</p>
                  <p v-else>
                    {{ faq.answer.split("Terms and Image Policy")[0] }}
                    <a @click="goToTerms" class="faq-link"
                      >Terms and Image Policy</a
                    >
                    {{
                      faq.answer
                        .split("Terms and Image Policy")
                        .slice(1)
                        .join("Terms and Image Policy")
                    }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="premium-footer">
          <div class="footer-container">
            <p class="footer-copyright">
              © 2024 Photoreka. All rights reserved.
            </p>
            <a @click="goToTerms" class="footer-link">Terms & Image Policy</a>
          </div>
        </footer>

        <!-- Request Access Dialog -->
        <RequestAccessDialog
          v-model:show="showRequestDialog"
          @success="onRequestSuccess"
        />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import {
  ref,
  onMounted,
  onUnmounted,
  nextTick,
  computed,
  onBeforeUnmount,
} from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import {
  NButton,
  NIcon,
  NConfigProvider,
  NMessageProvider,
  useMessage,
} from "naive-ui";
import {
  RocketOutline,
  PlayCircleOutline,
  SearchOutline,
  ImagesOutline,
  CloudUploadOutline,
  CubeOutline,
  ColorPaletteOutline,
  ChevronDownOutline,
  DownloadOutline,
  SyncOutline,
  ChatbubblesOutline,
  ShareSocialOutline,
  LinkOutline,
  SunnyOutline,
  MoonOutline,
  WalkOutline,
  PersonOutline,
  ImageOutline,
  StopOutline,
} from "@vicons/ionicons5";
import { Workspace } from "@vicons/carbon";
import { BookOpen16Regular, Trophy20Regular } from "@vicons/fluent";
import AppLogo from "@/components/AppLogo.vue";
import RequestAccessDialog from "@/components/RequestAccessDialog.vue";
import MaintenanceBanner from "@/components/MaintenanceBanner.vue";
import { isMobileDevice } from "@/utils/utils.js";
import { trackUserAction, trackEvent } from "@/utils/analytics";
import { useTheme } from "@/composables/useTheme.js";
import { PaletteOutlined } from "@vicons/material";

const router = useRouter();
const message = useMessage();

// Theme management - usar sistema centralizado normalmente
const {
  naiveTheme: currentTheme,
  naiveThemeOverrides: themeOverrides,
  themeMode,
  toggleTheme: baseToggleTheme,
  canToggleTheme,
} = useTheme();

// Wrapper para toggle con tracking
const toggleTheme = () => {
  baseToggleTheme();
  trackEvent("theme_toggle", { mode: themeMode.value });
};

// Video demo management
const videoPlayer = ref(null);
const videoContainer = ref(null);
const videoPlaying = ref(false);
const activeTab = ref(0);
const videoProgress = ref(0);
const autoPlayTriggered = ref(false);
const isAutoSwitching = ref(false);
const observer = ref(null);
const fallbackTimeout = ref(null);

// Dialog states
const showRequestDialog = ref(false);
const activeFAQ = ref(null);

// Intersection observers for animations
const heroSection = ref(null);
const featuresSection = ref(null);
const integrationSection = ref(null);
const sourcesSection = ref(null);
const freeToolsSection = ref(null);
const faqsSection = ref(null);

const heroVisible = ref(false);
const featuresVisible = ref(false);
const integrationVisible = ref(false);
const sourcesVisible = ref(false);
const freeToolsVisible = ref(false);
const faqsVisible = ref(false);

// Video tabs data
const videoTabs = ref([
  {
    title: "3D Atlas",
    icon: CubeOutline,
    videoUrl: new URL("@/assets/videos/atlas_1.mp4", import.meta.url).href,
    speed: 1.5,
    delaySeconds: 1.2,
    endSeconds: 39, // Puedes poner un número aquí si quieres cortar antes
  },
  // {
  //   title: "Canvas",
  //   icon: ColorPaletteOutline,
  //   videoUrl: new URL("@/assets/videos/canvas_1.mp4", import.meta.url).href,
  //   speed: 1.2,
  //   delaySeconds: 0,
  //   endSeconds: undefined, // Puedes poner un número aquí si quieres cortar antes
  // },
  // {
  //   title: "Search",
  //   icon: SearchOutline,
  //   videoUrl: new URL("@/assets/videos/explorer_1.mp4", import.meta.url).href,
  //   speed: 1.5,
  //   delaySeconds: 0,
  // },
  // {
  //   title: "Project Builder",
  //   icon: ImagesOutline,
  //   videoUrl: new URL("@/assets/videos/project_builder_1.mp4", import.meta.url)
  //     .href,
  //   speed: 2.8,
  //   delaySeconds: 0,
  // },
  // {
  //   title: "Score Ranking",
  //   icon: Trophy20Regular,
  //   videoUrl: new URL("@/assets/videos/visual_scores_1.mp4", import.meta.url)
  //     .href,
  //   speed: 2,
  //   delaySeconds: 0,
  // },
]);

// Lightroom video
const lightroomVideoUrl = new URL(
  "@/assets/videos/lr_plugin.mp4",
  import.meta.url
).href;

// Features data
const features = ref([
  {
    icon: SearchOutline,
    title: "Semantic Search",
    description:
      'Find photos instantly using natural language. Look for exact matches ("children playing"), or figurative ones ("Blade Runner-style photos").',
    color: "#2563eb",
  },
  {
    icon: Workspace,
    title: "Canvas",
    description:
      "Create stunning photo layouts and compositions with our intuitive canvas tool. Drag, drop, resize, and arrange your photos to tell your story.",
    color: "#8b5cf6",
  },
  {
    icon: Trophy20Regular,
    title: "Score Rankings",
    description:
      "Get automatic ratings of your photos and classify them according to different aesthetic criteria (composition, mood, originality, etc.)",
    color: "#f59e0b",
  },
  {
    icon: ImagesOutline,
    title: "Smart Curation",
    description:
      "Compile photos of specific themes or styles with the help of our smart curator. Get feedback on each photo and discover hidden insights and connections.",
    color: "#22c55e",
  },
]);

// Data sources
const dataSources = ref([
  {
    icon: CloudUploadOutline,
    name: "Local Files",
    description:
      "Upload photos directly from your computer. Supports all major image formats (JPEG, PNG, TIFF).",
    color: "#22c55e",
    comingSoon: false,
  },
  {
    logo: new URL("@/assets/logos/google_photos.png", import.meta.url).href,
    name: "Google Photos",
    description:
      "Sync your entire Google Photos library with one click. Keep your photos organized across platforms.",
    comingSoon: false,
  },
  {
    logo: new URL("@/assets/logos/lightroom_logo.png", import.meta.url).href,
    name: "Adobe Lightroom",
    description:
      "Connect directly with your Lightroom Classic catalog through our official plugin.",
    comingSoon: false,
  },
  {
    icon: LinkOutline,
    name: "More Integrations",
    description:
      "iCloud Photos, Dropbox, OneDrive, and more cloud storage providers coming soon.",
    color: "#6b7280",
    comingSoon: true,
  },
]);

// FAQs data
const faqs = ref([
  {
    question: "What is Photoreka and who is it for?",
    answer:
      "Photoreka is a smart photo curation lab to help street, documentary, and artistic photographers organize, analyze, and understand their photographic body of work. It's ideal for professional and amateur photographers managing large volumes of images.",
  },
  {
    question: "How does Photoreka work?",
    answer:
      "Our pipeline of computer vision algorithms analyzes your photographs, identifying narrative and stylistic elements. This enables intelligent organization, advanced semantic searches, and the creation of visual connections between your images to facilitate the selection of your work. For detailed information on our image processing policies, please see our Terms and Image Policy.",
    hasLink: true,
  },
  {
    question: "Is Photoreka a storage platform?",
    answer:
      "Photoreka is currently in a testing phase and focuses mainly on playful interaction and exploration with your photos. At this stage, it is not a full storage service. However, a centralized storage feature may be included in the future to help photographers fully manage and centralize their body of work. For details about how we handle your images, see our Terms and Image Policy.",
    hasLink: true,
  },
  {
    question: "Does Photoreka create or transform images?",
    answer:
      "No. Photoreka is dedicated exclusively to the analysis and organization of photographic images. The platform does not generate synthetic images, alter, or transform your photos in any way. We do not support or endorse the creation or use of synthetic or manipulated images within Photoreka.",
  },
  {
    question: "What happens to my photos and who can see them?",
    answer:
      "We only store a reduced version of your images on secure servers—sufficient to facilitate searches and for common social media uses, but not for any other purpose. The analysis is performed using proprietary and third-party services under agreements that prevent retaining or reusing your photos. They are not shared with anyone and you always retain 100% of the rights to your work. For complete details, please read our Terms and Image Policy.",
    hasLink: true,
  },
  {
    question: "Can I try Photoreka for free?",
    answer: `Analyzing your photos requires a single batch payment. Afterward, you can use most tools for free, with some daily/total limits, or purchase credits to work unlimitedly. <span style='color:var(--premium-primary);font-weight:600;'>During the <a href='#' style='color:var(--premium-primary);text-decoration:underline;' onclick='event.preventDefault();window.__goToEarlyAccess && window.__goToEarlyAccess()'>early access</a> phase, a free photo package and usage credits will be offered.</span>`,
    hasHtml: true,
  },
]);

// Navigation methods
const goToAuth = (mode = "login") => {
  trackUserAction("navigate_to_auth", "landing_page_premium", mode);
  if (mode === "signup") {
    showRequestDialog.value = true;
  } else {
    router.push({ name: "auth", query: { mode } });
  }
};

const goToTerms = () => {
  trackUserAction("navigate_to_terms", "landing_page_premium");
  const termsUrl = router.resolve({ name: "terms" }).href;
  window.open(termsUrl, "_blank");
};

const goToPlayground = () => {
  trackUserAction("navigate_to_playground", "landing_page_premium", "canvas");
  const playgroundUrl = router.resolve({ name: "canvas-playground" }).href;
  window.open(playgroundUrl, "_blank");
};

const goToFreeFramer = () => {
  trackUserAction("navigate_to_playground", "landing_page_premium", "framer");
  const playgroundUrl = router.resolve({ name: "free-framer" }).href;
  window.open(playgroundUrl, "_blank");
};

const onRequestSuccess = () => {};

// Video methods
const setActiveTab = (index, isAutoSwitch = false) => {
  if (!isAutoSwitch) {
    const tabName = videoTabs.value[index]?.title || `tab_${index}`;
    trackEvent("video_tab_change", {
      tab_name: tabName.toLowerCase().replace(" ", "_"),
      tab_index: index,
      previous_tab: activeTab.value,
      is_manual: true,
    });
  }

  activeTab.value = index;
  videoProgress.value = 0;
  videoPlaying.value = false;
  autoPlayTriggered.value = false;
  isAutoSwitching.value = isAutoSwitch;

  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }

  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }

  if (videoPlayer.value) {
    videoPlayer.value.currentTime = 0;
    videoPlayer.value.load();

    if (isAutoSwitch) {
      setTimeout(() => {
        startVideoPlayback();
      }, 200);
    } else {
      nextTick(() => {
        setTimeout(() => {
          setupIntersectionObserver();
          fallbackTimeout.value = setTimeout(() => {
            if (!autoPlayTriggered.value) {
              startVideoPlayback();
            }
          }, 5000);
        }, 100);
      });
    }
  }
};

const playVideo = () => {
  if (videoPlayer.value) {
    videoPlayer.value
      .play()
      .then(() => {
        videoPlaying.value = true;
      })
      .catch(console.log);
  }
};

const onVideoPlay = () => {
  videoPlaying.value = true;
};

const onVideoLoaded = () => {
  if (videoPlayer.value) {
    const currentTab = videoTabs.value[activeTab.value];
    videoPlayer.value.playbackRate = currentTab.speed || 1.0;
    // Empieza el video en el segundo indicado por delaySeconds (default 0)
    const delay =
      typeof currentTab.delaySeconds === "number" ? currentTab.delaySeconds : 0;
    videoPlayer.value.currentTime = delay;
  }
};

const onLightroomVideoLoaded = () => {
  const lightroomVideoElement = document.querySelector(".integration-video");
  if (lightroomVideoElement) {
    lightroomVideoElement.playbackRate = 2;
  }
};

const updateProgress = () => {
  if (videoPlayer.value) {
    const currentTab = videoTabs.value[activeTab.value];
    let end = videoPlayer.value.duration;
    if (
      typeof currentTab.endSeconds === "number" &&
      currentTab.endSeconds > 0 &&
      currentTab.endSeconds < end
    ) {
      end = currentTab.endSeconds;
    }
    const progress =
      ((videoPlayer.value.currentTime - (currentTab.delaySeconds || 0)) /
        (end - (currentTab.delaySeconds || 0))) *
      100;
    videoProgress.value = Math.max(0, Math.min(progress, 100)) || 0;
    // Si llegó al final deseado, disparar onVideoEnded
    if (
      typeof currentTab.endSeconds === "number" &&
      videoPlayer.value.currentTime >= currentTab.endSeconds
    ) {
      videoPlayer.value.pause();
      videoPlayer.value.currentTime = end;
      onVideoEnded();
    }
  }
};

const onVideoEnded = () => {
  videoProgress.value = 100;
  videoPlaying.value = false;
  const nextTab = (activeTab.value + 1) % videoTabs.value.length;
  setTimeout(() => {
    setActiveTab(nextTab, true);
  }, 300);
};

const startVideoPlayback = () => {
  if (autoPlayTriggered.value) return;
  autoPlayTriggered.value = true;

  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }

  if (videoPlayer.value) {
    const playPromise = videoPlayer.value.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          videoPlaying.value = true;
        })
        .catch((error) => {
          console.log("Error playing video:", error);
          autoPlayTriggered.value = false;
        });
    }
  }
};

const setupIntersectionObserver = () => {
  if (!videoPlayer.value) return;

  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }

  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const isFullyVisible = entry.intersectionRatio === 1.0;
        const boundingRect = entry.boundingClientRect;
        const rootBounds = entry.rootBounds;

        const isCompletelyInView =
          boundingRect.top >= (rootBounds?.top || 0) &&
          boundingRect.left >= (rootBounds?.left || 0) &&
          boundingRect.bottom <= (rootBounds?.bottom || window.innerHeight) &&
          boundingRect.right <= (rootBounds?.right || window.innerWidth);

        const finallyVisible = isFullyVisible && isCompletelyInView;

        if (finallyVisible && !autoPlayTriggered.value) {
          startVideoPlayback();
        }
      });
    },
    {
      threshold: 1.0,
      rootMargin: "0px",
    }
  );

  observer.value.observe(videoPlayer.value);
};

// FAQ methods
const toggleFAQ = (index) => {
  const wasOpen = activeFAQ.value === index;
  activeFAQ.value = activeFAQ.value === index ? null : index;
  trackEvent("faq_toggle", {
    faq_index: index,
    action: wasOpen ? "close" : "open",
    question:
      faqs.value[index]?.question?.substring(0, 50) + "..." || `FAQ ${index}`,
  });
};

// Scroll-based animations
const setupScrollAnimations = () => {
  const observerOptions = {
    threshold: 0.2,
    rootMargin: "0px 0px -100px 0px",
  };

  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        heroVisible.value = true;
      }
    });
  }, observerOptions);

  const featuresObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        featuresVisible.value = true;
      }
    });
  }, observerOptions);

  const integrationObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        integrationVisible.value = true;
      }
    });
  }, observerOptions);

  const sourcesObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        sourcesVisible.value = true;
      }
    });
  }, observerOptions);

  const freeToolsObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        freeToolsVisible.value = true;
      }
    });
  }, observerOptions);

  const faqsObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        faqsVisible.value = true;
      }
    });
  }, observerOptions);

  if (heroSection.value) heroObserver.observe(heroSection.value);
  if (featuresSection.value) featuresObserver.observe(featuresSection.value);
  if (integrationSection.value)
    integrationObserver.observe(integrationSection.value);
  if (sourcesSection.value) sourcesObserver.observe(sourcesSection.value);
  if (freeToolsSection.value) freeToolsObserver.observe(freeToolsSection.value);
  if (faqsSection.value) faqsObserver.observe(faqsSection.value);
};

onMounted(() => {
  // Hero is immediately visible
  heroVisible.value = true;

  // Load video
  if (videoPlayer.value) {
    videoPlayer.value.load();
  }

  nextTick(() => {
    setTimeout(() => {
      setupIntersectionObserver();
    }, 100);

    fallbackTimeout.value = setTimeout(() => {
      if (!autoPlayTriggered.value) {
        startVideoPlayback();
      }
    }, 5000);
  });

  // Setup scroll animations
  setupScrollAnimations();
});

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }
  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }
});

// Attach goToAuth('signup') to window for FAQ HTML link
if (typeof window !== "undefined") {
  window.__goToEarlyAccess = () => goToAuth("signup");
}
</script>

<style scoped>
/* ========================================================================
   CSS VARIABLES - LANDING SPECIFIC
   ======================================================================== */

.premium-landing {
  /* Spacing variables específicas de la landing */
  --section-padding-y: 70px;
  --section-padding-y-small: 60px;
  --section-gap: 40px;
  --header-margin-bottom: 64px;
}

/* ========================================================================
   BASE STYLES
   ======================================================================== */

.premium-landing {
  min-height: 100vh;
  background: var(--premium-bg);
  color: var(--premium-text-primary);
  overflow-x: hidden;
  transition: background 0.3s ease, color 0.3s ease;
}

.premium-landing {
  background: radial-gradient(
      circle at 20% 30%,
      var(--premium-gradient-2) 0%,
      transparent 25%
    ),
    radial-gradient(
      circle at 95% 60%,
      var(--premium-gradient-3) 0%,
      transparent 25%
    ),
    radial-gradient(
      circle at 5% 90%,
      var(--premium-gradient-2) 0%,
      transparent 20%
    ),
    var(--premium-bg) !important;
}

/* ========================================================================
   NAVIGATION
   ======================================================================== */

.premium-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  /* border-bottom: 1px solid var(--premium-border); */
  transition: all 0.3s ease;
}

[data-theme="light"] .premium-nav {
  background: rgba(255, 255, 255, 0.9) !important;
}

.nav-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 32px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-brand {
  display: flex;
  align-items: center;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--premium-surface);
  border: 1px solid var(--premium-border);
  color: var(--premium-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-toggle:hover {
  background: var(--premium-bg-elevated);
  border-color: var(--premium-primary);
  color: var(--premium-primary);
}

/* ========================================================================
   HERO SECTION
   ======================================================================== */

.hero-section {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: var(--section-padding-y) 0;
  overflow: hidden;
  background: transparent;
}

.hero-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 0.4;
}

[data-theme="light"] .hero-background {
  opacity: 0.25;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  animation: float 20s ease-in-out infinite;
  opacity: 0.6;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(
    circle,
    var(--premium-gradient-1) 0%,
    transparent 70%
  );
  top: -200px;
  right: -200px;
  animation-delay: 0s;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(
    circle,
    var(--premium-gradient-2) 0%,
    transparent 70%
  );
  bottom: -150px;
  left: -150px;
  animation-delay: 5s;
}

.orb-3 {
  width: 400px;
  height: 400px;
  background: radial-gradient(
    circle,
    var(--premium-gradient-3) 0%,
    transparent 70%
  );
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 10s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}

.hero-container {
  position: relative;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 32px;
  padding-top: 70px;
  z-index: 1;
}

.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 24px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  padding: 8px 20px;
  border-radius: 100px;
  background: var(--premium-bg-elevated);
  border: 1px solid var(--premium-border);
  font-size: 14px;
  font-weight: 500;
  color: var(--premium-text-secondary);
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.hero-badge.visible {
  opacity: 1;
  transform: translateY(0);
}

.badge-content {
  display: flex;
  font-size: 13px;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.hero-title {
  font-size: 68px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0;
  max-width: 1000px;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}

.hero-title.visible {
  opacity: 1;
  transform: translateY(0);
}

.gradient-text {
  background: linear-gradient(
    135deg,
    var(--premium-gradient-2),
    var(--premium-gradient-3)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-description {
  font-size: 18px;
  line-height: 1.7;
  color: var(--premium-text-secondary);
  max-width: 800px;
  margin: 0;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
}

.hero-description.visible {
  opacity: 1;
  transform: translateY(0);
}

.emoji-bullet {
  display: inline;
  color: inherit;
  font-size: inherit;
  color: var(--premium-primary);
}

.hero-demo {
  width: 100%;
  max-width: 1100px;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
  margin-top: 10px;
}

.hero-demo.visible {
  opacity: 1;
  transform: translateY(0);
}

.demo-tabs {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--premium-bg-elevated);
  border-radius: 16px;
  border: 1px solid var(--premium-border);
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.demo-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  /* border-radius: 12px; */
  background: transparent;
  border: none;
  color: var(--premium-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.demo-tab:hover {
  background: rgba(37, 99, 235, 0.08);
  color: var(--premium-text-primary);
}

.demo-tab.active {
  background: var(--premium-primary);
  color: white;
  font-weight: 600;
}

.demo-tab.active .n-icon {
  color: white;
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px 2px 0 0;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: var(--premium-accent);
  transition: width 0.1s linear;
}

.demo-video-container {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
  /* aspect-ratio: 16 / 7.61; */
}

[data-theme="light"] .demo-video-container {
  background: #f8f9fa;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.demo-video {
  width: 100%;
  height: auto;
  display: block;
}

.video-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: all 0.3s ease;
}

[data-theme="light"] .video-play-overlay {
  background: rgba(0, 0, 0, 0.3);
}

.video-play-overlay:hover {
  background: rgba(0, 0, 0, 0.6);
}

[data-theme="light"] .video-play-overlay:hover {
  background: rgba(0, 0, 0, 0.5);
}

.play-button {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  transition: all 0.3s ease;
  color: white;
}

[data-theme="light"] .play-button {
  background: rgba(37, 99, 235, 0.9);
  color: white;
}

.video-play-overlay:hover .play-button {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.25);
}

[data-theme="light"] .video-play-overlay:hover .play-button {
  background: var(--premium-primary);
}

/* ========================================================================
   TOOLS BANNER
   ======================================================================== */

.tools-banner {
  padding: var(--section-padding-y-small) 0;
  /* border-top: 1px solid var(--premium-border); */
  /* border-bottom: 1px solid var(--premium-border); */
  background: transparent;
}

.banner-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
}

.banner-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--premium-text-secondary);
  opacity: 0.9;
}

.banner-buttons {
  display: flex;
  gap: 12px;
}

.tool-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 100px;
  background: var(--premium-bg);
  border: 1px solid var(--premium-border);
  color: var(--premium-text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.tool-chip:hover {
  background: var(--premium-bg-elevated);
  border-color: var(--premium-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
}
.section-container {
  background-color: var(--bg-container);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  margin-bottom: var(--spacing-2xl);
}
/* ========================================================================
   SECTION COMMON STYLES
   ======================================================================== */

.section-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 32px;
  background: transparent !important;
  border: none !important;
}

.section-header {
  text-align: center;
  margin-bottom: var(--header-margin-bottom);
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.section-header.visible {
  opacity: 1;
  transform: translateY(0);
}

.section-title {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 16px 0;
  letter-spacing: -0.01em;
}

.section-subtitle {
  font-size: 18px;
  line-height: 1.6;
  color: var(--premium-text-secondary);
  max-width: 700px;
  margin: 0 auto;
}

/* ========================================================================
   FEATURES SECTION
   ======================================================================== */

.features-section {
  padding: var(--section-padding-y) 0;
  background: transparent;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.feature-card {
  padding: 40px;
  background: var(--premium-surface);
  border: 1px solid var(--premium-border);
  border-radius: 20px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  transform: translateY(30px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
}

.feature-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.feature-card:hover {
  border-color: var(--premium-primary);
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(37, 99, 235, 0.2);
}

.feature-icon {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.08),
    rgba(139, 92, 246, 0.08)
  );
  border-radius: 24px;
  opacity: 0.5;
  z-index: 0;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.feature-card:hover .feature-icon {
  opacity: 0.7;
  transform: scale(1.1) rotate(5deg);
}

.feature-icon :deep(.n-icon) {
  font-size: 72px !important;
}

.feature-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px 0;
  position: relative;
  z-index: 1;
}

.feature-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--premium-text-secondary);
  margin: 0;
  position: relative;
  z-index: 1;
}

/* ========================================================================
   INTEGRATION SECTION
   ======================================================================== */

.integration-section {
  padding: var(--section-padding-y) 0;
  /* border-top: 1px solid var(--premium-border); */
  /* border-bottom: 1px solid var(--premium-border); */
  background: transparent;
}

.integration-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
}

.integration-visual {
  opacity: 0;
  transform: translateX(-30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.integration-visual.visible {
  opacity: 1;
  transform: translateX(0);
}

.video-frame {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.1);
  border: none;
  background: #000;
}

[data-theme="light"] .video-frame {
  background: #f8f9fa;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.integration-video {
  width: 100%;
  height: auto;
  display: block;
}

.integration-content {
  opacity: 0;
  transform: translateX(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}

.integration-content.visible {
  opacity: 1;
  transform: translateX(0);
}

.integration-badge {
  display: inline-flex;
  margin-bottom: 20px;
}

.integration-badge span {
  padding: 6px 16px;
  border-radius: 100px;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.12),
    rgba(139, 92, 246, 0.12)
  );
  border: 1.5px solid var(--premium-primary);
  font-size: 12px;
  font-weight: 600;
  color: var(--premium-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.15);
}

.integration-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.integration-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.integration-title {
  font-size: 36px;
  font-weight: 700;
  margin: 0;
}

.integration-description {
  font-size: 17px;
  line-height: 1.7;
  color: var(--premium-text-secondary);
  margin: 0 0 32px 0;
}

.integration-features {
  list-style: none;
  padding: 0;
  margin: 0 0 32px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.integration-features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
}

.feature-icon-wrapper {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.08),
    rgba(139, 92, 246, 0.08)
  );
  border-radius: 8px;
  flex-shrink: 0;
}

.integration-cta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cta-note {
  font-size: 14px;
  color: var(--premium-text-tertiary);
}

/* ========================================================================
   SOURCES SECTION
   ======================================================================== */

.sources-section {
  padding: var(--section-padding-y) 0;
  background: transparent;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
}

.source-card {
  padding: 40px;
  background: var(--premium-surface);
  border: 1px solid var(--premium-border);
  border-radius: 20px;
  text-align: center;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  transform: translateY(30px);
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.source-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.source-card:hover {
  border-color: var(--premium-primary);
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(37, 99, 235, 0.15);
}

.source-card.coming-soon {
  opacity: 0.6;
}

.source-card.coming-soon:hover {
  opacity: 0.8;
}

.source-icon {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.08),
    rgba(139, 92, 246, 0.08)
  );
  border-radius: 16px;
  margin-bottom: 20px;
}

.source-logo-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.source-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.source-description {
  font-size: 14px;
  line-height: 1.6;
  color: var(--premium-text-secondary);
  margin: 0 0 20px 0;
  flex-grow: 1;
}

.source-badge {
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-badge.available {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.4);
  font-weight: 600;
}

[data-theme="light"] .source-badge.available {
  color: #15803d;
}

.source-badge.soon {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
  border: 1px solid rgba(107, 114, 128, 0.4);
  font-weight: 600;
}

[data-theme="light"] .source-badge.soon {
  color: #4b5563;
}

/* ========================================================================
   FREE TOOLS SECTION
   ======================================================================== */

.free-tools-section {
  padding: var(--section-padding-y) 0;
  background: transparent;
  position: relative;
  overflow: hidden;
}

.tools-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 100px;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.12),
    rgba(139, 92, 246, 0.12)
  );
  border: 1.5px solid var(--premium-primary);
  font-size: 13px;
  font-weight: 600;
  color: var(--premium-primary);
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
}

.tools-showcase {
  display: grid;
  grid-template-columns: 1fr;
  gap: 64px;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.tools-showcase.visible {
  opacity: 1;
  transform: translateY(0);
}

.tool-card {
  background: var(--premium-surface);
  border: 1px solid var(--premium-border);
  border-radius: 24px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.tool-card:hover {
  border-color: var(--premium-primary);
  /* transform: translateY(-4px); */
  box-shadow: 0 20px 48px rgba(37, 99, 235, 0.2);
}

.tool-card-framer:hover {
  border-color: #f59e0b;
  box-shadow: 0 20px 48px rgba(245, 158, 11, 0.2);
}

/* Large Card - 2 Column Layout (contenido e imagen lado a lado) */
.tool-card-large {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  grid-template-rows: none;
  min-height: auto;
}

/* Framer card: contenido izquierda, imagen derecha */
.tool-card-framer {
  grid-template-columns: 1fr 1.3fr;
  grid-template-rows: none;
}

.tool-card-framer .tool-card-content {
  order: 1;
}

.tool-card-framer .tool-visual {
  order: 2;
}

/* Segunda tarjeta (Canvas Playground): imagen izquierda, contenido derecha */
.tool-card-large:nth-child(2) .tool-card-content {
  order: 2;
}

.tool-card-large:nth-child(2) .tool-visual {
  order: 1;
}

.tool-card-content {
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--premium-surface);
  position: relative;
  z-index: 2;
  order: 1;
}

.tool-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 4px;
}

.tool-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.25);
}

.tool-icon-framer {
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.25);
}

.tool-meta {
  flex: 1;
}

.tool-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  line-height: 1.2;
  color: var(--premium-text-primary);
}

.tool-tag {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 100px;
  background: var(--premium-bg-elevated);
  border: 1px solid var(--premium-border);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--premium-text-secondary);
}

.tool-description {
  font-size: 15px;
  line-height: 1.7;
  color: var(--premium-text-secondary);
  margin: 0;
}

.tool-features {
  list-style: none;
  padding: 0;
  margin: 12px 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-features li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--premium-text-secondary);
  line-height: 1.5;
}

.tool-features li .n-icon {
  color: var(--premium-primary);
  flex-shrink: 0;
}

.tool-card-framer .tool-features li .n-icon {
  color: #f59e0b;
}

.tool-cta {
  margin-top: auto;
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
}

.tool-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 500px;
  order: 2;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.05) 0%,
    rgba(139, 92, 246, 0.05) 100%
  );
}

[data-theme="light"] .tool-visual {
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.03) 0%,
    rgba(139, 92, 246, 0.03) 100%
  );
}

.framer-visual {
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.05) 0%,
    rgba(249, 115, 22, 0.05) 100%
  );
}

[data-theme="light"] .framer-visual {
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.03) 0%,
    rgba(249, 115, 22, 0.03) 100%
  );
}

.tool-screenshot-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.tool-screenshot {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-theme="light"] .tool-screenshot {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);
}

.tool-card:hover .tool-screenshot {
  /* transform: scale(1.02); */
}

.compact-visual {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    var(--premium-gradient-1),
    var(--premium-accent)
  );
  border-radius: 16px;
  margin: -20px -20px 0 -20px;
  position: relative;
  overflow: hidden;
}

.tool-description-compact {
  font-size: 13px;
  line-height: 1.5;
  color: var(--premium-text-secondary);
  margin: 0;
  flex: 1;
}

.tool-cta-compact {
  width: 100%;
}

/* Responsive */
@media (max-width: 1024px) {
  .tools-showcase {
    grid-template-columns: 1fr;
  }

  .tool-visual {
    min-height: 350px;
  }

  .tool-screenshot-wrapper {
    padding: 32px;
  }
}

@media (max-width: 768px) {
  /* Volver al layout de 2 filas en mobile */
  .tool-card-large {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  .tool-card-framer {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  /* Restablecer el orden original para mobile */
  .tool-card-content {
    padding: 32px 24px;
    order: 2;
  }

  .tool-card-framer .tool-card-content {
    order: 1;
  }

  .tool-visual {
    order: 1;
    min-height: 300px;
  }

  .tool-card-framer .tool-visual {
    order: 2;
  }

  .tool-title {
    font-size: 24px;
  }

  .tool-screenshot-wrapper {
    padding: 24px;
  }
}

@media (max-width: 480px) {
  .tool-card-content {
    padding: 24px 20px;
  }

  .tool-title {
    font-size: 20px;
  }

  .tool-icon {
    width: 44px;
    height: 44px;
  }

  .tool-visual {
    min-height: 250px;
  }

  .tool-screenshot-wrapper {
    padding: 20px;
  }

  .tool-description {
    font-size: 14px;
  }

  .tool-features li {
    font-size: 13px;
  }
}

/* ========================================================================
   FAQS SECTION
   ======================================================================== */

.faqs-section {
  padding: var(--section-padding-y) 0;
  /* border-top: 1px solid var(--premium-border); */
  background: transparent;
}

.faqs-container {
  max-width: 900px;
  margin: 0 auto;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.faqs-container.visible {
  opacity: 1;
  transform: translateY(0);
}

.faq-item {
  background: var(--premium-bg-elevated);
  border: 1px solid var(--premium-border);
  border-radius: 16px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.faq-item:hover {
  border-color: var(--premium-primary);
}

.faq-item.active {
  border-color: var(--premium-primary);
}

.faq-question {
  width: 100%;
  padding: 24px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.faq-question:hover {
  background: var(--premium-bg-elevated);
}

.faq-q {
  font-size: 17px;
  font-weight: 600;
  color: var(--premium-text-primary);
}

.faq-icon {
  color: var(--premium-text-secondary);
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.faq-icon.rotated {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 28px 24px 28px;
}

.faq-answer p {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--premium-text-secondary);
}

.faq-link {
  color: var(--premium-primary);
  text-decoration: underline;
  cursor: pointer;
  transition: color 0.2s ease;
}

.faq-link:hover {
  color: var(--premium-accent);
}

/* ========================================================================
   FOOTER
   ======================================================================== */

.premium-footer {
  padding: 40px 0;
  background: var(--premium-surface);
  /* border-top: 1px solid var(--premium-border); */
}

.footer-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-copyright {
  margin: 0;
  font-size: 14px;
  color: var(--premium-text-tertiary);
}

.footer-link {
  font-size: 14px;
  color: var(--premium-text-secondary);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.footer-link:hover {
  color: var(--premium-primary);
}

/* ========================================================================
   RESPONSIVE
   ======================================================================== */

@media (max-width: 1024px) {
  .hero-title {
    font-size: 56px;
  }

  .integration-layout {
    grid-template-columns: 1fr;
    gap: 48px;
  }

  .integration-visual {
    order: 2;
  }

  .integration-content {
    order: 1;
  }
}

@media (max-width: 768px) {
  .nav-container {
    padding: 0 20px;
    height: 64px;
  }

  .nav-actions {
    gap: 8px;
  }

  /* .theme-toggle {
    display: none;
  } */

  .hero-section {
    padding: 60px 0 60px;
  }

  .hero-container,
  .section-container,
  .banner-container {
    padding: 0 20px;
  }

  .hero-title {
    font-size: 42px;
  }

  .hero-description {
    font-size: 16px;
  }

  .demo-tabs {
    display: none;
  }

  .section-title {
    font-size: 36px;
  }

  .section-subtitle {
    font-size: 16px;
  }

  .premium-landing {
    --section-padding-y: 60px;
    --section-padding-y-small: 40px;
    --section-gap: 24px;
    --header-margin-bottom: 48px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .integration-header {
    justify-content: center;
  }

  .integration-title {
    font-size: 25px;
  }

  .integration-description {
    font-size: 15px;
    text-align: center;
  }

  .integration-features {
    align-items: flex-start;
  }

  .integration-cta {
    flex-direction: column;
    align-items: center;
  }

  .sources-grid {
    grid-template-columns: 1fr;
  }

  .footer-container {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .premium-landing {
    --section-padding-y: 48px;
    --section-padding-y-small: 32px;
    --section-gap: 20px;
    --header-margin-bottom: 40px;
  }

  .nav-container {
    padding: 0 16px;
  }

  .hero-container,
  .section-container,
  .banner-container {
    padding: 0 16px;
  }

  .hero-title {
    font-size: 36px;
  }

  .hero-description {
    font-size: 15px;
  }

  .section-title {
    font-size: 32px;
  }

  .banner-container {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
