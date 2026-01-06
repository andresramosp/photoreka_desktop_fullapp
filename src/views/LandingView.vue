<template>
  <n-message-provider>
    <!-- Maintenance Banner -->
    <MaintenanceBanner />

    <div class="landing-page">
      <!-- Navigation Header -->

      <nav class="landing-nav">
        <div class="nav-container">
          <div class="nav-brand">
            <div class="logo">
              <AppLogo :inline="true" />
            </div>
          </div>
          <div class="nav-actions">
            <!-- Direct link to FAQs section -->

            <n-button text @click="goToAuth('login')"> Login </n-button>
            <!-- <n-button type="primary" @click="goToAuth('signup')">
            Sign Up
          </n-button> -->
            <n-button type="info" size="large" @click="goToAuth('signup')">
              <template #icon>
                <n-icon><RocketOutline /></n-icon>
              </template>
              Request Access
            </n-button>
          </div>
        </div>
      </nav>

      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-container">
          <div class="hero-content">
            <div class="hero-text">
              <h1 class="hero-title">
                Photoreka
                <span class="hero-accent">Curation Lab</span>
              </h1>
              <span class="hero-subtitle"
                >Street | Documentary | Conceptual | Abstract | Landscape</span
              >
              <p class="hero-description">
                Start making sense of your photographic body of work with our
                powerful engine. 🕵️‍♂️ Explore through natural language queries. 🎨
                Build series for documentary or conceptual projects. 🎞️ Sequence
                images by narrative or chromatic similarity 🏆 Rank your photos
                by various aesthetic aspects and find the hidden gems in your
                catalog.
              </p>
              <!-- <p class="hero-tools-subtitle">
                Need to sequence or frame photos? Try our free tools
              </p>
              <div class="hero-actions">
                <n-button
                  v-if="!isMobileDevice()"
                  type="warning"
                  size="medium"
                  @click="goToPlayground"
                >
                  <template #icon>
                    <n-icon><Workspace /></n-icon>
                  </template>
                  Canvas
                </n-button>
                <n-button size="medium" type="warning" @click="goToFreeFramer">
                  <template #icon>
                    <n-icon><StopOutline /></n-icon>
                  </template>
                  Framer
                </n-button>
              </div> -->
            </div>
            <div class="hero-visual">
              <div class="video-tabs-container" ref="demoSection">
                <div class="video-tabs">
                  <div
                    v-for="(tab, index) in videoTabs"
                    :key="index"
                    class="video-tab"
                    :class="{ active: activeTab === index }"
                    @click="setActiveTab(index, false)"
                  >
                    <div class="tab-header">
                      <n-icon
                        size="20"
                        :color="activeTab === index ? '#2563eb' : '#6b7280'"
                      >
                        <component :is="tab.icon" />
                      </n-icon>
                      <span class="tab-title">{{ tab.title }}</span>
                    </div>
                    <div class="tab-progress" v-if="activeTab === index">
                      <div
                        class="progress-bar"
                        :style="{ width: `${videoProgress}%` }"
                      ></div>
                    </div>
                  </div>
                </div>
                <div class="video-container" ref="videoContainer">
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
                  >
                    Your browser does not support the video tag.
                  </video>
                  <div
                    class="video-overlay"
                    v-if="!videoPlaying"
                    @click="playVideo"
                  >
                    <n-icon size="64" color="#ffffff">
                      <PlayCircleOutline />
                    </n-icon>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Free Tools Mini Section -->

      <!-- Features Section -->
      <section class="features-section">
        <div class="floating-header">
          <h2 class="floating-title">Powerful Features for Photographers</h2>
          <p class="floating-description">
            Everything you need to organize and curate your photo collection
          </p>
        </div>
        <div class="floating-features">
          <div class="floating-feature-card">
            <div class="feature-icon">
              <n-icon size="40" color="#2563eb">
                <SearchOutline />
              </n-icon>
            </div>
            <h3 class="feature-title">Semantic Search</h3>
            <p class="feature-description">
              Find photos instantly using natural language. Look for exact
              matches ("children playing"), or figurative ones ("Blade
              Runner-style photos").
            </p>
          </div>
          <div class="floating-feature-card">
            <div class="feature-icon">
              <n-icon size="40" color="#8b5cf6">
                <Workspace />
              </n-icon>
            </div>
            <h3 class="feature-title">Interactive Canvas</h3>
            <p class="feature-description">
              Create stunning photo layouts and compositions with our intuitive
              canvas tool. Drag, drop, resize, and arrange your photos to tell
              your story.
            </p>
            <!-- <n-button
              style="margin-top: 16px"
              v-if="!isMobileDevice()"
              type="warning"
              size="medium"
              @click="goToPlayground"
            >
              <template #icon>
                <n-icon><Workspace /></n-icon>
              </template>
              Try it Now
            </n-button> -->
          </div>
          <div class="floating-feature-card">
            <div class="feature-icon">
              <n-icon size="40" color="#f59e0b">
                <Trophy16Regular />
              </n-icon>
            </div>
            <h3 class="feature-title">Score Rankings</h3>
            <p class="feature-description">
              Get automatic ratings of your photos and classify them according
              to different aesthetic criteria (composition, mood, originality,
              etc.)
            </p>
          </div>
          <div class="floating-feature-card">
            <div class="feature-icon">
              <n-icon size="40" color="#22c55e">
                <ImagesOutline />
              </n-icon>
            </div>
            <h3 class="feature-title">Smart Curation</h3>
            <p class="feature-description">
              Compile photos of specific themes or styles with the help of our
              smart curator. Get feedback on each photo and discover hidden
              insights and connections.
            </p>
          </div>
          <!-- <div class="floating-feature-card">
          <div class="feature-icon">
            <n-icon size="40" color="#ef4444">
              <ColorPaletteOutline />
            </n-icon>
          </div>
          <h3 class="feature-title">Style Transfer</h3>
          <p class="feature-description">
            Apply artistic styles to your photos with advanced tools. Transform
            ordinary photos into artistic masterpieces with one click.
          </p>
        </div>
        <div class="floating-feature-card">
          <div class="feature-icon">
            <n-icon size="40" color="#06b6d4">
              <CloudUploadOutline />
            </n-icon>
          </div>
          <h3 class="feature-title">Cloud Sync</h3>
          <p class="feature-description">
            Seamlessly sync your photos across all devices. Access your entire
            collection anywhere with automatic backup and organization.
          </p>
        </div> -->
        </div>
      </section>

      <section class="free-tools-mini">
        <div class="free-tools-mini-container">
          <span class="free-tools-label">You can also try our free tools</span>
          <div class="free-tools-buttons">
            <button class="free-tool-btn" @click="goToPlayground">
              <n-icon size="18" color="#8b5cf6"><Workspace /></n-icon>
              <span>Canvas</span>
            </button>
            <button class="free-tool-btn" @click="goToFreeFramer">
              <n-icon size="18" color="#f59e0b"><StopOutline /></n-icon>
              <span>Framer</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Lightroom Plugin Section -->
      <section class="lightroom-section">
        <div class="lightroom-container">
          <div class="lightroom-video-side">
            <div class="lightroom-video-wrapper">
              <video
                class="lightroom-demo-video"
                :src="lightroomVideoUrl"
                @loadeddata="onLightroomVideoLoaded"
                autoplay
                muted
                loop
                playsinline
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
          <div class="lightroom-info-side">
            <div class="lightroom-badge">
              <span class="badge-text">Official Plugin</span>
            </div>
            <div class="lightroom-header">
              <img
                src="/src/assets/logos/lightroom_logo.png"
                alt="Adobe Lightroom"
                class="lightroom-icon"
              />
              <h2 class="lightroom-title">Lightroom Integration</h2>
            </div>
            <p class="lightroom-description">
              Seamlessly connect Photoreka with Adobe Lightroom Classic. Sync
              your catalog, search by natural language directly from Lightroom,
              and bring the power of intelligent curation to your existing
              workflow.
            </p>
            <ul class="lightroom-features-list">
              <li>
                <n-icon size="20" color="#2563eb"><SyncOutline /></n-icon>
                <span>Direct sync from Lightroom catalog</span>
              </li>
              <li>
                <n-icon size="20" color="#8b5cf6"
                  ><ChatbubblesOutline
                /></n-icon>
                <span>Search by natural language integrated</span>
              </li>

              <li>
                <n-icon size="20" color="#f59e0b"
                  ><ShareSocialOutline
                /></n-icon>
                <span>One-click photo transfer to Photoreka tools</span>
              </li>
              <li>
                <n-icon size="20" color="#22c55e"><LinkOutline /></n-icon>
                <span>Compatible with Photoreka web workflow</span>
              </li>
            </ul>
            <div class="lightroom-cta">
              <n-button type="primary" size="large" @click="goToAuth('signup')">
                <template #icon>
                  <n-icon><DownloadOutline /></n-icon>
                </template>
                Get the Plugin
              </n-button>
              <span class="lightroom-note">Free with Photoreka account</span>
            </div>
          </div>
        </div>
      </section>
      <!-- How It Works Section -->
      <!-- <section class="how-it-works-section">
        <div class="floating-header">
          <h2 class="floating-title">Photoreka Workflow</h2>
          <p class="floating-description">
            Get started in minutes with our simple 3-step process
          </p>
        </div>
        <div class="floating-steps">
          <div class="floating-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h3 class="step-title">Synchronize Your Photos</h3>
              <p class="step-description">
                Simply drag and drop your photos or connect your existing photo
                library. We support all major formats and cloud storage
                providers.
              </p>
            </div>
          </div>
          <div class="floating-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h3 class="step-title">Vision Analysis</h3>
              <p class="step-description">
                Our computer vision algorithms analyze your photos for
                narrative, chromatic, cultural and aesthetics aspects based on
                your profile.
              </p>
            </div>
          </div>
          <div class="floating-step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h3 class="step-title">Discover & Create</h3>
              <p class="step-description">
                Use powerful natural language search, create stunning and
                coherent grids, sequence images by different criteria, and
                discover hidden gems in your collection.
              </p>
            </div>
          </div>
        </div>
      </section> -->

      <!-- Data Sources Section -->
      <section class="data-sources-section">
        <div class="data-sources-container">
          <div class="sources-header">
            <h2 class="sources-title">Connect Your Photos From Anywhere</h2>
            <p class="sources-description">
              Photoreka works seamlessly with multiple photo sources. Import
              your images from wherever they live and start curating
              immediately.
            </p>
          </div>
          <div class="sources-grid">
            <!-- Local Files -->
            <div class="source-card">
              <div class="source-icon-wrapper">
                <n-icon size="48" color="#22c55e">
                  <CloudUploadOutline />
                </n-icon>
              </div>
              <h3 class="source-name">Local Files</h3>
              <p class="source-description">
                Upload photos directly from your computer. Supports all major
                image formats (JPEG, PNG, TIFF).
              </p>
              <div class="source-badge available">Available Now</div>
            </div>

            <!-- Google Photos -->
            <div class="source-card">
              <div class="source-icon-wrapper">
                <img
                  src="/src/assets/logos/google_photos.png"
                  alt="Google Photos"
                  class="source-logo"
                />
              </div>
              <h3 class="source-name">Google Photos</h3>
              <p class="source-description">
                Sync your entire Google Photos library with one click. Keep your
                photos organized across platforms.
              </p>
              <div class="source-badge available">Available Now</div>
            </div>

            <!-- Lightroom -->
            <div class="source-card">
              <div class="source-icon-wrapper">
                <img
                  src="/src/assets/logos/lightroom_logo.png"
                  alt="Adobe Lightroom"
                  class="source-logo"
                />
              </div>
              <h3 class="source-name">Adobe Lightroom</h3>
              <p class="source-description">
                Connect directly with your Lightroom Classic catalog through our
                official plugin.
              </p>
              <div class="source-badge available">Available Now</div>
            </div>

            <!-- Coming Soon -->
            <div class="source-card coming-soon">
              <div class="source-icon-wrapper">
                <n-icon size="48" color="#6b7280">
                  <LinkOutline />
                </n-icon>
              </div>
              <h3 class="source-name">More Integrations</h3>
              <p class="source-description">
                iCloud Photos, Dropbox, OneDrive, and more cloud storage
                providers coming soon.
              </p>
              <div class="source-badge soon">Coming Soon</div>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQs Section -->
      <section id="faqs" class="faqs-section">
        <div class="section-container" style="margin-top: 80px">
          <div class="faqs-header">
            <h2 class="section-title">Frequently Asked Questions</h2>
            <p class="section-subtitle">
              Find answers to the most common questions about Photoreka
            </p>
          </div>
          <div class="faqs-container">
            <div class="faq-item" v-for="(faq, index) in faqs" :key="index">
              <div
                class="faq-question"
                @click="toggleFAQ(index)"
                :class="{ active: activeFAQ === index }"
              >
                <h3>{{ faq.question }}</h3>
                <n-icon :class="{ rotated: activeFAQ === index }">
                  <ChevronDownOutline />
                </n-icon>
              </div>
              <div
                class="faq-answer"
                :class="{ expanded: activeFAQ === index }"
              >
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

      <!-- Testimonials Section -->
      <!-- <section class="testimonials-section">
      <div class="section-container">
        <div class="section-header">
          <h2 class="section-title">Loved by Photographers Worldwide</h2>
        </div>
        <div class="testimonials-grid">
          <div class="testimonial-card">
            <div class="testimonial-content">
              <p class="testimonial-text">
                "Photoreka has revolutionized how I manage my wedding
                photography business. The AI search is incredibly accurate and
                saves me hours every week."
              </p>
              <div class="testimonial-author">
                <div class="author-avatar">
                  <n-avatar size="medium" color="#2563eb">
                    <n-icon><PersonOutline /></n-icon>
                  </n-avatar>
                </div>
                <div class="author-info">
                  <span class="author-name">Sarah Johnson</span>
                  <span class="author-role">Wedding Photographer</span>
                </div>
              </div>
            </div>
          </div>
          <div class="testimonial-card">
            <div class="testimonial-content">
              <p class="testimonial-text">
                "The canvas feature is a game-changer for creating client
                presentations. I can quickly put together stunning mood boards
                that wow my clients."
              </p>
              <div class="testimonial-author">
                <div class="author-avatar">
                  <n-avatar size="medium" color="#8b5cf6">
                    <n-icon><PersonOutline /></n-icon>
                  </n-avatar>
                </div>
                <div class="author-info">
                  <span class="author-name">Mike Chen</span>
                  <span class="author-role">Portrait Photographer</span>
                </div>
              </div>
            </div>
          </div>
          <div class="testimonial-card">
            <div class="testimonial-content">
              <p class="testimonial-text">
                "As a travel blogger, I needed a tool that could help me find
                the perfect shots from thousands of photos. Photoreka's AI
                search is exactly what I needed."
              </p>
              <div class="testimonial-author">
                <div class="author-avatar">
                  <n-avatar size="medium" color="#22c55e">
                    <n-icon><PersonOutline /></n-icon>
                  </n-avatar>
                </div>
                <div class="author-info">
                  <span class="author-name">Emma Rodriguez</span>
                  <span class="author-role">Travel Blogger</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section> -->

      <!-- CTA Section -->
      <!-- <section class="cta-section">
      <div class="section-container">
        <div class="cta-content">
          <h2 class="cta-title">Ready to Transform Your Photo Workflow?</h2>
          <p class="cta-description">
            Join thousands of photographers who have already discovered the
            power of AI-driven photo management.
          </p>
          <div class="cta-actions">
            <n-button type="primary" size="large" @click="goToAuth('signup')">
              <template #icon>
                <n-icon><RocketOutline /></n-icon>
              </template>
              Get Started Free
            </n-button>
            <n-button size="large" quaternary @click="goToAuth('login')">
              <template #icon>
                <n-icon><LogInOutline /></n-icon>
              </template>
              Sign In
            </n-button>
          </div>
          <p class="cta-note">No credit card required • 14-day free trial</p>
        </div>
      </div>
    </section> -->

      <!-- Footer -->
      <!-- <footer class="landing-footer">
        <div class="footer-container">
          <div class="footer-content">
            <div class="footer-brand">
              <div class="logo">
                <img :src="logoName" alt="Photoreka" class="logo-image" />
              </div>
              <p class="footer-description">
                Discovery photo assistant and organization platform for creative
                professionals.
              </p>
            </div>
            <div class="footer-links">
              <div class="link-group">
                <h4 class="link-title">Product</h4>
                <a href="#" class="link">Features</a>
                <a href="#" class="link">Pricing</a>
                <a href="#" class="link">API</a>
              </div>
              <div class="link-group">
                <h4 class="link-title">Company</h4>
                <a href="#" class="link">About</a>
                <a href="#" class="link">Blog</a>
                <a href="#" class="link">Careers</a>
              </div>
              <div class="link-group">
                <h4 class="link-title">Legal</h4>
                <a @click="goToTerms" class="link">Terms & Image Policy</a>
                <a href="#" class="link">Privacy</a>
                <a href="#" class="link">Contact</a>
              </div>
            </div>
          </div>
          <div class="footer-bottom">
            <p class="copyright">© 2024 Photoreka. All rights reserved.</p>
          </div>
        </div>
      </footer> -->

      <!-- Simple Footer -->
      <footer class="simple-footer">
        <div class="simple-footer-container">
          <p class="copyright">© 2024 Photoreka. All rights reserved.</p>
          <a @click="goToTerms" class="terms-link">Terms & Image Policy</a>
        </div>
      </footer>

      <!-- Request Access Dialog -->
      <RequestAccessDialog
        v-model:show="showRequestDialog"
        @success="onRequestSuccess"
      />

      <!-- Mobile Notice Dialog -->
      <MobileNoticeDialog
        v-model:show="showMobileNotice"
        @goHome="onMobileNoticeGoHome"
      />
    </div>
  </n-message-provider>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { NButton, NIcon, NAvatar, useMessage } from "naive-ui";
import {
  CameraOutline,
  RocketOutline,
  PlayOutline,
  PlayCircleOutline,
  SearchOutline,
  AppsOutline,
  ImagesOutline,
  ColorPaletteOutline,
  CloudUploadOutline,
  PersonOutline,
  LogInOutline,
  ChevronDownOutline,
  StopOutline,
  CubeOutline,
  CheckmarkCircleOutline,
  DownloadOutline,
  SyncOutline,
  ChatbubblesOutline,
  ShareSocialOutline,
  LinkOutline,
} from "@vicons/ionicons5";
import { Workspace } from "@vicons/carbon";
import AppLogo from "@/components/AppLogo.vue";
import RequestAccessDialog from "@/components/RequestAccessDialog.vue";
import MobileNoticeDialog from "@/components/MobileNoticeDialog.vue";
import MaintenanceBanner from "@/components/MaintenanceBanner.vue";
import { isMobileDevice } from "@/utils/utils.js";
import { Trophy16Regular, Trophy20Regular } from "@vicons/fluent";
import { trackUserAction, trackEvent } from "@/utils/analytics";

const router = useRouter();
const demoSection = ref(null);
const videoPlayer = ref(null);
const videoPlaying = ref(false);
const activeTab = ref(0);
const videoProgress = ref(0);
const showRequestDialog = ref(false);
const showMobileNotice = ref(false);
const message = useMessage();
const activeFAQ = ref(null);

// Video visibility and auto-play management
const videoContainer = ref(null);
const videoFullyVisible = ref(false);
const autoPlayTriggered = ref(false);
const fallbackTimeout = ref(null);
const observer = ref(null);
const isAutoSwitching = ref(false); // Track if switching was triggered by video end

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
    answer: `Analyzing your photos requires a single batch payment. Afterward, you can use most tools for free, with some daily/total limits, or purchase credits to work unlimitedly. <span style='color:var(--info-color);font-weight:600;'>During the <a href='#' style='color:var(--info-color);text-decoration:underline;' onclick='event.preventDefault();window.__goToEarlyAccess && window.__goToEarlyAccess()'>early access</a> phase, a free photo package and usage credits will be offered.</span>`,
    hasHtml: true,
  },
]);

// Lightroom plugin demo video
const lightroomVideo = ref({
  url: new URL("@/assets/videos/lr_plugin.mp4", import.meta.url).href,
  speed: 2,
});

const lightroomVideoUrl = lightroomVideo.value.url;

// Video tabs with different use cases
const videoTabs = ref([
  {
    title: "Canvas",
    icon: ColorPaletteOutline,
    videoUrl: new URL("@/assets/videos/canvas_1.mp4", import.meta.url).href, // local video
    speed: 1.2,
  },
  {
    title: "3D Atlas",
    icon: CubeOutline,
    videoUrl: new URL("@/assets/videos/atlas_1.mp4", import.meta.url).href, // local video
    speed: 1.2,
  },
  {
    title: "Explorer",
    icon: SearchOutline,
    videoUrl: new URL("@/assets/videos/explorer_1.mp4", import.meta.url).href, // local video
    speed: 1.5,
  },
  {
    title: "Project Builder",
    icon: ImagesOutline,
    videoUrl: new URL("@/assets/videos/project_builder_1.mp4", import.meta.url)
      .href, // local video
    speed: 2.8,
  },
  {
    title: "Score Ranking",
    icon: Trophy20Regular,
    videoUrl: new URL("@/assets/videos/visual_scores_1.mp4", import.meta.url)
      .href, // local video
    speed: 2,
  },
]);

const goToAuth = (mode = "login") => {
  // Track auth intent
  trackUserAction("navigate_to_auth", "landing_page", mode);

  if (mode === "signup") {
    showRequestDialog.value = true;
  } else if (mode === "login" && isMobileDevice()) {
    // Show mobile notice for login on mobile devices
    showMobileNotice.value = true;
  } else {
    router.push({ name: "auth", query: { mode } });
  }
};

const goToTerms = () => {
  trackUserAction("navigate_to_terms", "landing_page");
  const termsUrl = router.resolve({ name: "terms" }).href;
  window.open(termsUrl, "_blank");
};

const goToPlayground = () => {
  trackUserAction("navigate_to_playground", "landing_page", "canvas");
  const playgroundUrl = router.resolve({ name: "canvas-playground" }).href;
  window.open(playgroundUrl, "_blank");
};

const goToFreeFramer = () => {
  trackUserAction("navigate_to_playground", "landing_page", "framer");
  const playgroundUrl = router.resolve({ name: "free-framer" }).href;
  window.open(playgroundUrl, "_blank");
};

const scrollToDemo = () => {
  trackUserAction("scroll_to_demo", "landing_page");
  demoSection.value?.scrollIntoView({ behavior: "smooth" });
};

const onRequestSuccess = () => {};

const onMobileNoticeGoHome = () => {
  // User is already on home page, just close the dialog
  showMobileNotice.value = false;
};

const setActiveTab = (index, isAutoSwitch = false) => {
  console.log(`Setting active tab to: ${index}, auto-switch: ${isAutoSwitch}`);

  // Track video tab interaction if it's not an auto-switch
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
  autoPlayTriggered.value = false; // Reset auto-play trigger for new tab
  videoFullyVisible.value = false; // Reset visibility state for new tab
  isAutoSwitching.value = isAutoSwitch;

  // Clear any existing fallback timeout
  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }

  // Clean up existing observer
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }

  if (videoPlayer.value) {
    videoPlayer.value.currentTime = 0;
    videoPlayer.value.load(); // Force reload the video to show first frame

    // If this is an auto-switch (video ended), start playing immediately
    if (isAutoSwitch) {
      console.log(
        "Auto-switching from previous video, starting playback immediately"
      );
      // Small delay to ensure video is loaded
      setTimeout(() => {
        startVideoPlayback();
      }, 200);
    } else {
      // If manual click on tab, use visibility detection for first video only
      console.log("Manual tab selection, setting up visibility detection");
      // Wait for video to load and then setup new observer
      nextTick(() => {
        setTimeout(() => {
          // Reconfigure intersection observer for the new video
          setupIntersectionObserver();

          // Set up new fallback timeout for this tab
          fallbackTimeout.value = setTimeout(() => {
            if (!autoPlayTriggered.value) {
              console.log(
                "Fallback timeout reached for tab change, starting video playback"
              );
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
  // Video is loaded and ready to play
  if (videoPlayer.value) {
    const currentTab = videoTabs.value[activeTab.value];
    videoPlayer.value.playbackRate = currentTab.speed || 1.0;
  }
  console.log("Video loaded successfully");
};

const onLightroomVideoLoaded = () => {
  // Set playback rate for Lightroom video
  const lightroomVideoElement = document.querySelector(".lightroom-demo-video");
  if (lightroomVideoElement) {
    lightroomVideoElement.playbackRate = lightroomVideo.value.speed || 1.0;
  }
  console.log("Lightroom video loaded successfully");
};

const updateProgress = () => {
  if (videoPlayer.value) {
    const progress =
      (videoPlayer.value.currentTime / videoPlayer.value.duration) * 100;
    videoProgress.value = progress || 0;
  }
};

const onVideoEnded = () => {
  console.log(`Video ended for tab ${activeTab.value}, switching to next tab`);
  videoProgress.value = 100;
  videoPlaying.value = false;

  // Auto-switch to next tab after video ends
  const nextTab = (activeTab.value + 1) % videoTabs.value.length;
  console.log(`Auto-switching from tab ${activeTab.value} to tab ${nextTab}`);

  setTimeout(() => {
    setActiveTab(nextTab, true); // Pass true to indicate auto-switch
  }, 300);
};

// Watch for tab changes to reset video
watch(activeTab, () => {
  videoProgress.value = 0;
});

// Video auto-play functionality
const startVideoPlayback = () => {
  if (autoPlayTriggered.value) {
    console.log(`Video playback already triggered for tab ${activeTab.value}`);
    return;
  }

  const switchType = isAutoSwitching.value
    ? "auto-switch"
    : "visibility/timeout";
  console.log(
    `Starting video playback for tab ${activeTab.value} via ${switchType}`
  );
  autoPlayTriggered.value = true;

  // Clear any existing fallback timeout
  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }

  if (videoPlayer.value) {
    // Ensure video is ready before playing
    const playPromise = videoPlayer.value.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          videoPlaying.value = true;
          console.log(
            `Video for tab ${activeTab.value} started playing automatically (${switchType})`
          );
        })
        .catch((error) => {
          console.log(`Error playing video for tab ${activeTab.value}:`, error);
          autoPlayTriggered.value = false; // Reset flag so it can be retried
        });
    }
  }
};

const setupIntersectionObserver = () => {
  if (!videoPlayer.value) return;

  // Clean up existing observer if it exists
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }

  console.log("Setting up new intersection observer for current video");

  // Observer to detect when video is fully visible
  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // More strict check: ensure the intersection ratio is exactly 1.0
        const isFullyVisible = entry.intersectionRatio === 1.0;
        const boundingRect = entry.boundingClientRect;
        const rootBounds = entry.rootBounds;

        // Additional check: ensure the entire element is within viewport bounds
        const isCompletelyInView =
          boundingRect.top >= (rootBounds?.top || 0) &&
          boundingRect.left >= (rootBounds?.left || 0) &&
          boundingRect.bottom <= (rootBounds?.bottom || window.innerHeight) &&
          boundingRect.right <= (rootBounds?.right || window.innerWidth);

        const finallyVisible = isFullyVisible && isCompletelyInView;

        console.log(`Video visibility check for tab ${activeTab.value}:`, {
          intersectionRatio: entry.intersectionRatio,
          isFullyVisible,
          isCompletelyInView,
          finallyVisible,
          autoPlayTriggered: autoPlayTriggered.value,
          boundingRect: {
            top: boundingRect.top,
            bottom: boundingRect.bottom,
            height: boundingRect.height,
          },
          viewport: {
            height: window.innerHeight,
          },
        });

        videoFullyVisible.value = finallyVisible;

        if (finallyVisible && !autoPlayTriggered.value) {
          console.log(
            `Video for tab ${activeTab.value} is fully visible, starting playback`
          );
          startVideoPlayback();
        }
      });
    },
    {
      threshold: 1.0, // Trigger only when 100% visible
      rootMargin: "0px",
    }
  );

  observer.value.observe(videoPlayer.value);
};

onMounted(() => {
  // Load the video to show the first frame but don't play yet
  if (videoPlayer.value) {
    videoPlayer.value.load();
  }

  // Wait for next tick to ensure DOM is fully rendered
  nextTick(() => {
    // Additional small delay to ensure video element is fully rendered
    setTimeout(() => {
      // Set up intersection observer to detect when video is fully visible
      setupIntersectionObserver();
    }, 100);

    // Set up fallback timeout (5 seconds) in case video is not fully visible
    fallbackTimeout.value = setTimeout(() => {
      if (!autoPlayTriggered.value) {
        console.log("Fallback timeout reached, starting video playback");
        startVideoPlayback();
      }
    }, 5000);
  });
});

onUnmounted(() => {
  // Clean up intersection observer
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }

  // Clear any pending timeouts
  if (fallbackTimeout.value) {
    clearTimeout(fallbackTimeout.value);
    fallbackTimeout.value = null;
  }
});

// FAQ functionality
const toggleFAQ = (index) => {
  const wasOpen = activeFAQ.value === index;
  activeFAQ.value = activeFAQ.value === index ? null : index;

  // Track FAQ interaction
  trackEvent("faq_toggle", {
    faq_index: index,
    action: wasOpen ? "close" : "open",
    question:
      faqs.value[index]?.question?.substring(0, 50) + "..." || `FAQ ${index}`,
  });
};

// Attach goToAuth('signup') to window for FAQ HTML link
if (typeof window !== "undefined") {
  window.__goToEarlyAccess = () => goToAuth("signup");
}
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f13 0%, #16161a 100%);
  color: var(--text-primary);
  overflow-x: hidden;
  overflow-y: auto;
}

/* Navigation */
.landing-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: rgba(15, 15, 19, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
}

.nav-brand .logo {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-shrink: 0;
}

.logo-image {
  height: 50px;
  width: auto;
  object-fit: contain;
}

.brand-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* Hero Section */
.hero-section {
  padding: 70px 0 80px;
  min-height: 100vh;
  display: flex;
  align-items: center;
}

.hero-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero-subtitle {
  margin-top: 8px;
  display: block;
  font-size: 15px;
  color: var(--text-primary);
  font-style: italic;
}
.hero-title {
  font-size: 52px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 0px;
  color: var(--text-primary);
}

.hero-accent {
  background: linear-gradient(135deg, #2563eb, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-faq-link {
  color: var(--text-primary);
  margin-right: 12px;
  text-decoration: none;
  font-weight: 600;
}
.nav-faq-link:hover {
  text-decoration: underline;
}

.hero-description {
  font-size: 18px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 30px;
  margin-top: 30px;
  /* font-weight: 200; */
}

.hero-tools-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  font-weight: 400;
  opacity: 0.8;
}

.hero-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 48px;
  justify-content: center;
  align-items: center;
}

.hero-stats {
  display: flex;
  gap: 48px;
}

.stat {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-label {
  font-size: 14px;
  color: var(--text-tertiary);
}

.hero-visual {
  position: relative;
  width: 100%;
  max-width: none;
}

.video-tabs-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.video-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 8px;
}

.video-tab {
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.video-tab:hover {
  background: rgba(37, 99, 235, 0.1);
}

.video-tab.active {
  background: rgba(37, 99, 235, 0.15);
  border: 1px solid var(--primary-color);
}

.tab-header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.tab-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: color 0.3s ease;
}

.video-tab.active .tab-title {
  color: var(--primary-color);
}

.tab-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(37, 99, 235, 0.2);
  border-radius: 0 0 8px 8px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #8b5cf6);
  border-radius: 0 0 8px 8px;
  transition: width 0.1s ease;
}

.video-container {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(37, 99, 235, 0.3);
  width: 100%;
  /* aspect-ratio: 5/ 7; */
}

.demo-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #111;
  display: block;
}

/* Specific styling for the first video (Canvas) to fill the container completely */

.video-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.video-overlay:hover {
  background: rgba(0, 0, 0, 0.6);
}

/* Free Tools Mini Section */
.free-tools-mini {
  background: linear-gradient(
    180deg,
    rgba(37, 99, 235, 0.05) 0%,
    transparent 100%
  );
  padding: 20px 0;
  /* border-bottom: 1px solid var(--border-color); */
}

.free-tools-mini-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
}

.free-tools-label {
  font-size: 14px;
  color: var(--secondary-color);
  font-weight: 400;
}

.free-tools-buttons {
  display: flex;
  gap: 12px;
}

.free-tool-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.free-tool-btn:hover {
  border-color: var(--primary-color);
  background: rgba(37, 99, 235, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

/* Lightroom Plugin Section */
.lightroom-section {
  padding: 100px 0;
  background: linear-gradient(
    180deg,
    #0f0f13 0%,
    rgba(37, 99, 235, 0.03) 50%,
    #0f0f13 100%
  );
  position: relative;
  overflow: hidden;
}

.lightroom-section::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    ellipse at 30% 50%,
    rgba(37, 99, 235, 0.08) 0%,
    transparent 60%
  );
  pointer-events: none;
}

.lightroom-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.lightroom-video-side {
  position: relative;
}

.lightroom-video-wrapper {
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 80px rgba(37, 99, 235, 0.15);
  /* border: 1px solid rgba(255, 255, 255, 0.1); */
}

.lightroom-video-wrapper::before {
  content: "";
  position: absolute;
  inset: -1px;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.3),
    rgba(139, 92, 246, 0.3),
    rgba(37, 99, 235, 0.1)
  );
  z-index: -1;
  padding: 1px;
}

.lightroom-demo-video {
  width: 100%;
  height: auto;
  display: block;
}

.lightroom-info-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.lightroom-badge {
  display: inline-flex;
  align-self: flex-start;
}

.badge-text {
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.2),
    rgba(139, 92, 246, 0.2)
  );
  border: 1px solid rgba(37, 99, 235, 0.3);
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lightroom-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.lightroom-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
}

.lightroom-title {
  font-size: 36px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}

.lightroom-description {
  font-size: 18px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0;
}

.lightroom-features-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lightroom-features-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  color: var(--text-primary);
}

.lightroom-features-list li .n-icon {
  flex-shrink: 0;
}

.lightroom-cta {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 8px;
}

.lightroom-note {
  font-size: 14px;
  color: var(--text-tertiary);
}

/* Sections */
.features-section,
.how-it-works-section,
.testimonials-section,
.cta-section {
  padding-bottom: 60px;
  position: relative;
}

/* Floating Headers */
.floating-header {
  text-align: center;
  margin-bottom: 60px;
  padding: 0 24px;
}

.floating-title {
  font-size: 40px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.floating-description {
  font-size: 18px;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

/* Floating Features */
.floating-features {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 32px;
  padding: 0 24px;
  width: 100%;
  box-sizing: border-box;
}

.floating-feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 32px 24px;
  text-align: center;
  transition: all 0.4s ease;
  width: 320px;
  max-width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.floating-feature-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.05),
    rgba(139, 92, 246, 0.05)
  );
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.floating-feature-card:hover::before {
  opacity: 1;
}

.floating-feature-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 20px 40px rgba(37, 99, 235, 0.25);
}

/* Features CTA */
.features-cta {
  text-align: center;
  margin-top: 80px;
  padding: 0 24px;
}

.features-cta-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 50px;
}

.features-cta-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 40px;
  opacity: 0.9;
}

.features-tools {
  display: flex;
  gap: 24px;
  justify-content: center;
  align-items: center;
}

.feature-tool-card {
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  transition: all 0.4s ease;
  width: 240px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
}

.feature-tool-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.05),
    rgba(139, 92, 246, 0.05)
  );
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.feature-tool-card:hover::before {
  opacity: 1;
}

.feature-tool-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 20px 40px rgba(37, 99, 235, 0.25);
}

.tool-icon {
  margin-bottom: 20px;
}

.tool-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tool-description {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}

/* Floating Steps */
.floating-steps {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 60px;
  padding: 0 24px;
  flex-wrap: wrap;
}

.floating-step {
  text-align: center;
  max-width: 300px;
  position: relative;
  background: rgba(37, 99, 235, 0.05);
  border-radius: 24px;
  padding: 40px 24px;
  transition: all 0.4s ease;
  border: 1px solid rgba(37, 99, 235, 0.1);
}

.floating-step:hover {
  transform: translateY(-6px);
  background: rgba(37, 99, 235, 0.1);
  border-color: var(--primary-color);
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.2);
}

.floating-step:not(:last-child)::after {
  content: "→";
  position: absolute;
  right: -30px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24px;
  color: var(--primary-color);
  font-weight: bold;
}

.section-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.section-header {
  text-align: center;
  margin-bottom: 64px;
}

.section-title {
  font-size: 35px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.section-description {
  font-size: 18px;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

/* Features Grid (legacy - keeping for other sections) */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 32px;
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  transition: all 0.3s ease;
}

.feature-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.2);
}

.feature-icon {
  margin-bottom: 24px;
}

.feature-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.feature-description {
  color: var(--text-secondary);
  line-height: 1.6;
}

/* How It Works */
.steps-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 48px;
}

.step {
  text-align: center;
}

.step-number {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), #8b5cf6);
  color: white;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
  transition: all 0.3s ease;
}

.floating-step:hover .step-number {
  transform: scale(1.1);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.4);
}

.step-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.step-description {
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Testimonials */
.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 32px;
}

.testimonial-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 32px;
}

.testimonial-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 24px;
  font-style: italic;
}

.testimonial-author {
  display: flex;
  align-items: center;
  gap: 16px;
}

.author-info {
  display: flex;
  flex-direction: column;
}

.author-name {
  font-weight: 600;
  color: var(--text-primary);
}

.author-role {
  font-size: 14px;
  color: var(--text-tertiary);
}

/* Data Sources Section */
.data-sources-section {
  /* padding: 40px 0; */
  background: linear-gradient(
    180deg,
    #0f0f13 0%,
    rgba(34, 197, 94, 0.03) 50%,
    #0f0f13 100%
  );
  position: relative;
  overflow: hidden;
  padding-bottom: 60px;
}

.data-sources-section::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    ellipse at 70% 50%,
    rgba(34, 197, 94, 0.08) 0%,
    transparent 60%
  );
  pointer-events: none;
}

.data-sources-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  position: relative;
  z-index: 1;
}

.sources-header {
  text-align: center;
  margin-bottom: 64px;
}

.sources-title {
  font-size: 40px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  line-height: 1.2;
}

.sources-description {
  font-size: 18px;
  line-height: 1.7;
  color: var(--text-secondary);
  max-width: 700px;
  margin: 0 auto;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 32px;
}

.source-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 40px 32px;
  text-align: center;
  transition: all 0.4s ease;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.source-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.05),
    rgba(37, 99, 235, 0.05)
  );
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.source-card:hover::before {
  opacity: 1;
}

.source-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(34, 197, 94, 0.2);
}

.source-card.coming-soon {
  opacity: 1;
  border-color: rgba(107, 114, 128, 0.3);
  background: rgba(107, 114, 128, 0.05);
}

.source-card.coming-soon:hover {
  border-color: rgba(107, 114, 128, 0.5);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(107, 114, 128, 0.15);
}

.source-icon-wrapper {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  transition: all 0.4s ease;
}

.source-card:hover .source-icon-wrapper {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.06);
}

.source-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
}

.source-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  line-height: 1.3;
}

.source-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 24px;
  flex-grow: 1;
}

.source-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-badge.available {
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.2),
    rgba(37, 99, 235, 0.2)
  );
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.source-badge.soon {
  background: rgba(107, 114, 128, 0.2);
  border: 1px solid rgba(107, 114, 128, 0.3);
  color: #9ca3af;
}

/* FAQs Section */
.faqs-section {
  padding-bottom: 60px;
  background: var(--bg-primary);
}

.faqs-header {
  text-align: center;
  margin-bottom: 64px;
}

.faqs-container {
  max-width: 800px;
  margin: 0 auto;
}

.faq-item {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  background: var(--bg-card);
  transition: all 0.3s ease;
}

.faq-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.1);
}

.faq-question {
  padding: 24px 32px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  transition: all 0.3s ease;
}

.faq-question:hover {
  background: var(--bg-hover);
}

.faq-question.active {
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
}

.faq-question h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
  padding-right: 16px;
}

.faq-question .n-icon {
  font-size: 20px;
  color: var(--text-secondary);
  transition: transform 0.3s ease;
}

.faq-question .n-icon.rotated {
  transform: rotate(180deg);
}

.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: none;
  background: var(--bg-card);
}

.faq-answer.expanded {
  max-height: none;
  padding: 0 32px 24px 32px;
}

.faq-answer p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 16px;
}

.faq-link {
  color: var(--primary-color);
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.3s ease;
}

.faq-link:hover {
  color: #8b5cf6;
}

/* CTA Section */
.cta-section {
  background: linear-gradient(135deg, #2563eb, #8b5cf6);
  color: white;
}

.cta-content {
  text-align: center;
}

.cta-title {
  font-size: 40px;
  font-weight: 700;
  margin-bottom: 16px;
}

.cta-description {
  font-size: 18px;
  margin-bottom: 32px;
  opacity: 0.9;
}

.cta-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 16px;
}

.cta-note {
  font-size: 14px;
  opacity: 0.8;
}

/* Footer */
.landing-footer {
  background: #0a0a0e;
  padding: 48px 0 24px;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.footer-content {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 48px;
  margin-bottom: 32px;
}

.footer-brand .logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.footer-description {
  color: var(--text-secondary);
  line-height: 1.6;
}

.footer-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}

.link-title {
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.link {
  display: block;
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: 8px;
  transition: color 0.2s ease;
}

.link:hover {
  color: var(--primary-color);
}

.footer-bottom {
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  text-align: center;
}

.copyright {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* Simple Footer */
.simple-footer {
  background: #0a0a0e;
  padding: 24px 0;
  border-top: 1px solid var(--border-color);
}

.simple-footer-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.simple-footer .copyright {
  color: var(--text-tertiary);
  font-size: 14px;
  margin: 0;
}

.terms-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.terms-link:hover {
  color: var(--primary-color);
}

/* Mobile Responsive */
@media (max-width: 1024px) {
  .video-tabs {
    display: none; /* Hide video tabs on tablets and smaller */
  }

  .floating-features {
    gap: 24px;
    padding: 0 20px;
  }

  .floating-feature-card {
    width: calc(50% - 12px);
    min-width: 280px;
  }

  .nav-container {
    padding: 0 20px;
  }

  .simple-footer-container {
    padding: 0 20px;
  }

  /* Lightroom section responsive */
  .lightroom-container {
    grid-template-columns: 1fr;
    gap: 48px;
  }

  .lightroom-video-side {
    order: 1;
  }

  .lightroom-info-side {
    order: 2;
    text-align: center;
    align-items: center;
  }

  .lightroom-header {
    flex-direction: column;
    gap: 12px;
  }

  .lightroom-features-list {
    align-items: flex-start;
    max-width: 400px;
  }

  .lightroom-cta {
    flex-direction: column;
    gap: 12px;
  }

  /* Data sources 1024px */
  .sources-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}

@media (max-width: 768px) {
  .hero-section {
    padding: 20px 0 0px;
  }

  .hero-content {
    gap: 40px;
  }

  .hero-title {
    font-size: 40px;
  }

  .hero-description {
    font-size: 17px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: center;
  }

  .hero-stats {
    justify-content: center;
    gap: 32px;
  }

  .video-tabs {
    flex-direction: column;
    gap: 4px;
    display: none; /* Hide video tabs on mobile */
  }

  .video-tab {
    padding: 8px 12px;
  }

  .tab-title {
    font-size: 12px;
  }

  .floating-title {
    font-size: 32px;
  }

  .floating-features {
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 0 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .floating-feature-card {
    width: calc(100% - 32px);
    max-width: 400px;
    min-width: 0;
    box-sizing: border-box;
  }

  .floating-steps {
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 0 16px;
  }

  .floating-step {
    max-width: 100%;
  }

  .floating-step:not(:last-child)::after {
    content: "↓";
    right: 50%;
    transform: translateX(50%);
    top: auto;
    bottom: -20px;
  }

  .features-grid,
  .testimonials-grid {
    grid-template-columns: 1fr;
  }

  .steps-container {
    grid-template-columns: 1fr;
  }

  .footer-content {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .footer-links {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .cta-actions {
    flex-direction: column;
    align-items: center;
  }

  .nav-container {
    padding: 0 16px;
    gap: 8px;
  }

  .nav-actions {
    gap: 8px;
  }

  .brand-name {
    font-size: 18px;
  }

  .section-container {
    padding: 0 16px;
  }

  .simple-footer-container {
    flex-direction: column;
    gap: 12px;
    text-align: center;
    padding: 0 16px;
  }

  .faq-question {
    padding: 20px 24px;
  }

  .faq-question h3 {
    font-size: 16px;
  }

  .faq-answer.expanded {
    padding: 0 24px 20px 24px;
  }

  .faq-answer p {
    font-size: 15px;
  }

  .features-cta {
    margin-top: 60px;
    padding: 0 16px;
  }

  .features-cta-title {
    font-size: 24px;
  }

  .features-tools {
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .feature-tool-card {
    width: calc(100% - 32px);
    max-width: 300px;
  }

  /* Lightroom section 768px */
  .lightroom-section {
    padding: 60px 0;
  }

  .lightroom-container {
    padding: 0 16px;
    gap: 40px;
  }

  .lightroom-video-side {
    order: 2;
  }

  .lightroom-info-side {
    order: 1;
  }

  .lightroom-badge {
    display: none;
  }

  .lightroom-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-direction: row;
    margin-top: 0;
    justify-content: center;
  }

  .lightroom-header .lightroom-title {
    margin: 0;
  }

  .lightroom-title {
    font-size: 28px;
  }

  .lightroom-description {
    font-size: 16px;
  }

  .lightroom-icon {
    width: 48px;
    height: 48px;
  }

  /* Free tools mini 768px */
  .free-tools-mini-container {
    padding: 0 16px;
    gap: 16px;
  }

  /* Data sources 768px */
  .data-sources-section {
    padding: 60px 0;
  }

  .sources-header {
    margin-bottom: 48px;
  }

  .sources-title {
    font-size: 32px;
  }

  .sources-description {
    font-size: 16px;
  }

  .sources-grid {
    grid-template-columns: 1fr;
    gap: 24px;
    max-width: 400px;
    margin: 0 auto;
  }

  .source-card {
    padding: 32px 24px;
  }
}

@media (max-width: 480px) {
  .floating-features {
    padding: 0 12px;
  }

  .floating-feature-card {
    width: calc(100% - 24px);
    padding: 24px 20px;
  }

  .floating-header {
    padding: 0 12px;
  }

  .hero-description {
    font-size: 15px;
  }

  .floating-steps {
    padding: 0 12px;
  }

  .nav-container {
    padding: 0 12px;
    height: 56px;
  }

  /* Data sources 480px */
  .sources-grid {
    padding: 0 16px;
  }

  .source-card {
    padding: 28px 20px;
  }

  .source-icon-wrapper {
    width: 70px;
    height: 70px;
  }

  .source-logo {
    width: 48px;
    height: 48px;
  }

  .source-name {
    font-size: 18px;
  }

  .source-description {
    font-size: 14px;
  }

  .simple-footer-container {
    padding: 0 12px;
  }

  .nav-actions {
    gap: 6px;
  }

  .brand-name {
    font-size: 16px;
  }

  /* Hide login text on very small screens, keep only button */
  .nav-actions .n-button:first-child {
    display: none;
  }

  .faq-question {
    padding: 16px 20px;
  }

  .faq-question h3 {
    font-size: 15px;
  }

  .faq-answer.expanded {
    padding: 0 20px 16px 20px;
  }

  .faq-answer p {
    font-size: 14px;
  }

  .features-cta {
    margin-top: 40px;
    padding: 0 12px;
  }

  .features-cta-title {
    font-size: 20px;
  }

  .feature-tool-card {
    width: calc(100% - 24px);
    padding: 24px 20px;
  }

  /* Lightroom section 480px */
  .lightroom-section {
    padding: 48px 0;
  }

  .lightroom-container {
    padding: 0 12px;
    gap: 32px;
  }

  .lightroom-title {
    font-size: 24px;
  }

  .lightroom-description {
    font-size: 15px;
  }

  .lightroom-icon {
    width: 40px;
    height: 40px;
  }

  .lightroom-features-list li {
    font-size: 14px;
  }

  .badge-text {
    font-size: 11px;
    padding: 5px 12px;
  }

  /* Free tools mini 480px */
  .free-tools-mini-container {
    flex-direction: column;
    gap: 12px;
    padding: 0 12px;
  }

  .free-tools-label {
    font-size: 13px;
  }

  .free-tool-btn {
    padding: 8px 16px;
    font-size: 13px;
  }
}

@media (max-width: 360px) {
  .nav-container {
    padding: 0 8px;
  }

  .simple-footer-container {
    padding: 0 8px;
  }

  .brand-name {
    font-size: 14px;
  }

  .nav-brand .logo {
    gap: 8px;
  }
}
</style>
