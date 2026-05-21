<template>
  <div class="settings-view view-container">
    <div class="settings-container">
      <div class="settings-header">
        <h1 class="settings-title">Settings</h1>
        <p class="settings-subtitle">
          Manage your account, preferences, and connections
        </p>
      </div>

      <div class="settings-grid">
        <!-- User Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <PersonOutline />
            </n-icon>
            <h2 class="section-title">Account</h2>
          </div>
          <div class="section-content">
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Display Name</label>
                <p class="setting-description">
                  Your name as it appears across the app
                </p>
              </div>
              <div class="setting-control">
                <n-input
                  :value="userName"
                  placeholder="Enter your name"
                  class="setting-input"
                  disabled
                />
                <n-button text type="primary" class="change-btn" disabled>
                  Save
                </n-button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Email Address</label>
                <p class="setting-description">
                  Used for notifications and account recovery
                </p>
              </div>
              <div class="setting-control">
                <n-input
                  :value="userEmail"
                  placeholder="Enter your email"
                  class="setting-input"
                  disabled
                />
                <n-button text type="primary" class="change-btn" disabled>
                  Save
                </n-button>
              </div>
            </div>

            <!-- Invite Friends Card -->
            <div class="invite-card" :class="{ disabled: isDemoUser }">
              <div class="invite-card-header">
                <div class="invite-icon-wrapper">
                  <n-icon size="24" color="var(--accent-color)">
                    <MailOutline />
                  </n-icon>
                </div>
                <div class="invite-card-info">
                  <span class="invite-card-title">Invite Friends</span>
                  <span class="invite-card-description">
                    <template v-if="isDemoUser">
                      This feature is not available for demo accounts.
                    </template>
                    <template v-else>
                      Give your friends access to Photoreka with a free batch of
                      1000 photos.
                    </template>
                  </span>
                </div>
              </div>
              <div class="invite-card-form">
                <n-input
                  v-model:value="inviteEmail"
                  placeholder="friend@email.com"
                  type="text"
                  class="invite-card-input"
                  :disabled="isSendingInvite || isDemoUser"
                  @keyup.enter="sendInvitation"
                />
                <n-button
                  type="info"
                  :loading="isSendingInvite"
                  :disabled="!inviteEmail || isSendingInvite || isDemoUser"
                  @click="sendInvitation"
                >
                  <template #icon>
                    <n-icon>
                      <SendOutline />
                    </n-icon>
                  </template>
                  Send
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- Preferences Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <SettingsOutline />
            </n-icon>
            <h2 class="section-title">Preferences</h2>
          </div>
          <div class="section-content">
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Profile</label>
                <p class="setting-description">Your photography profile</p>
              </div>
              <div class="setting-control">
                <n-tag type="info" size="medium">
                  {{ userProfileLabel }}
                </n-tag>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Preferred Source</label>
                <p class="setting-description">Where your photos come from</p>
              </div>
              <div class="setting-control">
                <n-tag type="info" size="medium">
                  {{ preferredSourceLabel }}
                </n-tag>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Language</label>
                <p class="setting-description">
                  Choose your preferred language
                </p>
              </div>
              <div class="setting-control">
                <n-select
                  disabled
                  v-model:value="selectedLanguage"
                  :options="languageOptions"
                  class="setting-select"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Theme</label>
                <p class="setting-description">Select your visual preference</p>
              </div>
              <div class="setting-control">
                <n-select
                  v-model:value="selectedTheme"
                  :options="themeOptions"
                  class="setting-select"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Connections Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <LinkOutline />
            </n-icon>
            <h2 class="section-title">Connections</h2>
          </div>
          <div class="section-content">
            <!-- Google Photos -->
            <div class="connection-item">
              <div class="connection-info">
                <img
                  :src="googlePhotosIconUrl"
                  alt="Google Photos"
                  class="connection-icon"
                />
                <div class="connection-details">
                  <span class="connection-name">Google Photos</span>
                  <span class="connection-description"
                    >Import and sync photos from your library</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag
                  v-if="isGooglePhotosConnected"
                  type="success"
                  size="small"
                  round
                >
                  Connected
                </n-tag>
                <n-tag v-else type="warning" size="small" round>
                  Not connected
                </n-tag>
                <n-button
                  v-if="isGooglePhotosConnected"
                  text
                  type="error"
                  size="small"
                  @click="disconnectGooglePhotos"
                >
                  Disconnect
                </n-button>
                <n-button
                  v-else
                  type="primary"
                  size="small"
                  @click="connectGooglePhotos"
                >
                  Connect
                </n-button>
              </div>
            </div>

            <!-- Instagram -->
            <div class="connection-item coming-soon">
              <div class="connection-info">
                <div class="connection-icon-wrapper instagram">
                  <n-icon size="24" color="#fff">
                    <LogoInstagram />
                  </n-icon>
                </div>
                <div class="connection-details">
                  <span class="connection-name">Instagram</span>
                  <span class="connection-description"
                    >Connect your Instagram account</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag type="info" size="small" round> Coming soon </n-tag>
              </div>
            </div>

            <!-- Dropbox -->
            <div class="connection-item">
              <div class="connection-info">
                <img
                  :src="dropboxIconUrl"
                  alt="Dropbox"
                  class="connection-icon"
                />
                <div class="connection-details">
                  <span class="connection-name">Dropbox</span>
                  <span class="connection-description"
                    >Import photos from your Dropbox</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag v-if="isDropboxReady" type="success" size="small" round>
                  Ready
                </n-tag>
                <n-tag v-else type="warning" size="small" round>
                  Not connected
                </n-tag>
                <n-button
                  v-if="!isDropboxReady"
                  type="primary"
                  size="small"
                  @click="connectDropbox"
                  :loading="dropbox.isLoading.value"
                >
                  Connect
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- Plans & Storage Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <CloudOutline />
            </n-icon>
            <h2 class="section-title">Photo Analysis & Credits</h2>
          </div>
          <div class="section-content">
            <!-- Current Plan -->
            <!-- <div class="current-plan-card">
              <div class="plan-info">
                <span class="plan-name">Free Plan</span>
                <n-tag type="info" size="small">Current Plan</n-tag>
              </div>
              <n-button
                type="primary"
                ghost
                size="small"
                @click="
                  message.info(
                    'Plans coming soon! Use the buttons below to add photos or credits.',
                  )
                "
              >
                View Plans
              </n-button>
            </div> -->

            <!-- Analysis Usage -->
            <div class="storage-usage-container">
              <div class="storage-header">
                <div class="storage-title-row">
                  <n-icon size="20" color="var(--primary-color)">
                    <LayersOutline />
                  </n-icon>
                  <span class="storage-title">Analyzed Photos</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="13"
                        color="var(--text-secondary)"
                        style="cursor: help"
                      >
                        <InfoCircleFilled />
                      </n-icon>
                    </template>
                    Total number of photos that have been analyzed by Photoreka
                    since your account was created.
                  </n-tooltip>
                </div>
                <span class="storage-count"
                  >{{ analyzedPhotosUsed }} / {{ analyzedPhotosLimit }}</span
                >
              </div>
              <div class="storage-progress-bar">
                <div
                  class="storage-progress-fill"
                  :style="{ width: analysisPercentage + '%' }"
                  :class="{
                    warning: analysisPercentage > 80,
                    critical: analysisPercentage > 95,
                  }"
                ></div>
              </div>
              <div class="storage-footer">
                <span class="storage-remaining"
                  >{{ analyzedPhotosRemaining }} analyses remaining</span
                >
                <n-button
                  type="info"
                  size="small"
                  :disabled="isDemoUser"
                  @click="
                    isPurchaseEnabledForUser
                      ? (showPhotosModal = true)
                      : (showPlansModal = true)
                  "
                >
                  <template #icon>
                    <n-icon>
                      <AddOutline />
                    </n-icon>
                  </template>
                  Add photos
                </n-button>
              </div>
            </div>

            <!-- Credits Usage -->
            <div class="storage-usage-container">
              <div class="storage-header">
                <div class="storage-title-row">
                  <n-icon size="20" color="var(--accent-color)">
                    <SparklesOutline />
                  </n-icon>
                  <span class="storage-title">Consumed Credits</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="13"
                        color="var(--text-secondary)"
                        style="cursor: help"
                      >
                        <InfoCircleFilled />
                      </n-icon>
                    </template>
                    Credits consumed by PRO tools such as the AI chat and
                    advanced semantic searches.
                  </n-tooltip>
                </div>
                <span class="storage-count"
                  >{{ creditsUsed }} / {{ creditsAvailable }}</span
                >
              </div>
              <div class="storage-progress-bar">
                <div
                  class="storage-progress-fill credits"
                  :style="{ width: creditsPercentage + '%' }"
                  :class="{
                    warning: creditsPercentage > 80,
                    critical: creditsPercentage > 95,
                  }"
                ></div>
              </div>
              <div class="storage-footer">
                <span class="storage-remaining"
                  >{{ creditsAvailable - creditsUsed }} credits remaining</span
                >
                <n-button
                  type="info"
                  size="small"
                  :disabled="isDemoUser"
                  @click="
                    isPurchaseEnabledForUser
                      ? (showCreditsModal = true)
                      : (showPlansModal = true)
                  "
                >
                  <template #icon>
                    <n-icon>
                      <AddOutline />
                    </n-icon>
                  </template>
                  Top credits
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- Save Button -->
        <!-- <div class="settings-actions">
          <n-button type="primary" size="large" @click="saveSettings">
            Save Changes
          </n-button>
        </div> -->
      </div>
    </div>
  </div>

  <!-- Photo Packages Modal -->
  <PhotoPackagesModal v-model:show="showPhotosModal" />

  <!-- Credit Purchase Modal -->
  <CreditPurchaseModal v-model:show="showCreditsModal" />

  <!-- Payment Success Modal -->
  <PaymentSuccessModal
    v-model:show="showPaymentSuccessModal"
    :session-id="paymentSessionId"
  />

  <!-- Plans & Credits Coming Soon Modal -->
  <n-modal
    v-model:show="showPlansModal"
    :style="{ width: '480px', maxWidth: '92vw' }"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="plans-modal-card"
    >
      <template #header-extra>
        <n-button text @click="showPlansModal = false" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
              />
            </svg>
          </n-icon>
        </n-button>
      </template>

      <div class="plans-modal-content">
        <div class="plans-modal-icon-wrapper">
          <n-icon size="32" color="var(--primary-color)">
            <CloudOutline />
          </n-icon>
        </div>
        <h3 class="plans-modal-title">Plans & Credits — Coming Soon</h3>
        <p class="plans-modal-body">
          We're working on a full plans and credits system that will let you
          expand your analysis quota and replenish credits directly from here.
        </p>

        <div class="plans-modal-highlight">
          <n-icon size="16" color="var(--accent-color)">
            <MailOutline />
          </n-icon>
          <span>
            In the meantime, reach out to us at
            <a href="mailto:hello@photoreka.com" class="plans-modal-link"
              >hello@photoreka.com</a
            >
            and we'll be happy to grant a courtesy increase.
          </span>
        </div>

        <div class="plans-modal-highlight plans-modal-highlight--bonus">
          <n-icon size="16" color="var(--warning-color)">
            <StarOutline />
          </n-icon>
          <span>
            <strong>Coming soon:</strong> earn bonus photos and credits for
            every friend you invite to Photoreka.
          </span>
        </div>
      </div>

      <template #action>
        <div class="plans-modal-actions">
          <n-button @click="showPlansModal = false">Close</n-button>
          <n-button
            type="primary"
            tag="a"
            href="mailto:hello@photoreka.com"
            @click="showPlansModal = false"
          >
            Contact us
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import {
  NInput,
  NSelect,
  NButton,
  NIcon,
  NTag,
  NTooltip,
  NModal,
  NCard,
  useMessage,
} from "naive-ui";
import {
  PersonOutline,
  SettingsOutline,
  LinkOutline,
  CloudOutline,
  AddOutline,
  LogoInstagram,
  MailOutline,
  SendOutline,
  StarOutline,
} from "@vicons/ionicons5";
import { SparklesOutline } from "@vicons/ionicons5";

import { LayersOutline } from "@vicons/ionicons5";
import { InfoCircleFilled } from "@vicons/antd";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import dropboxIconUrl from "@/assets/logos/dropbox.svg";
import { useUserStore } from "@/stores/userStore";
import { useTheme } from "@/composables/useTheme.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { useDropbox } from "@/composables/useDropbox.js";
import { api } from "@/utils/axios";
import PhotoPackagesModal from "@/components/PhotoPackagesModal.vue";
import CreditPurchaseModal from "@/components/CreditPurchaseModal.vue";
import PaymentSuccessModal from "@/components/PaymentSuccessModal.vue";

// ============================================================
// Toggle: set to true to enable real purchase modals,
//         set to false to show "coming soon" placeholder modal.
// Whitelist: specific emails can have purchase enabled
//            regardless of VITE_ENABLE_REAL_PURCHASE setting
// ============================================================
const ENABLE_REAL_PURCHASE =
  import.meta.env.VITE_ENABLE_REAL_PURCHASE === "true";

const PURCHASE_ENABLED_EMAILS = (
  import.meta.env.VITE_PURCHASE_ENABLED_EMAILS || ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter((email) => email.length > 0);

// Stores and composables
const userStore = useUserStore();
const route = useRoute();
const { isDarkMode, setTheme } = useTheme();
const googlePhotos = useGooglePhotos();
const dropbox = useDropbox();
const message = useMessage();

// Refresh usage on component mount
onMounted(async () => {
  await userStore.fetchUsage();
  checkPaymentRedirect();
});

// Payment success modal
const showPaymentSuccessModal = ref(false);
const paymentSessionId = ref<string | null>(null);

function checkPaymentRedirect() {
  if (route.query.payment !== "success") return;
  const sid =
    typeof route.query.session_id === "string" ? route.query.session_id : null;
  if (!sid) return;
  paymentSessionId.value = sid;
  showPaymentSuccessModal.value = true;
}

// Check if user is demo
const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});

// Check if purchase is enabled for current user
const isPurchaseEnabledForUser = computed(() => {
  // Check if globally enabled
  if (ENABLE_REAL_PURCHASE) return true;

  // Check if user email is in whitelist
  const userEmail = userStore.user?.email;
  if (!userEmail) return false;

  return PURCHASE_ENABLED_EMAILS.includes(userEmail.toLowerCase());
});

// User data (real)
const userName = computed(() => userStore.user?.name || "User");
const userEmail = computed(() => userStore.user?.email || "");

// Profile & preferred source labels
const singleProfileLabel: Record<string, string> = {
  general: "General",
  commercial: "Commercial",
  "street-photography": "Street Photography",
  documentary: "Documentary",
  artistic: "Artistic",
};

const userProfileLabel = computed(() => {
  const profiles = userStore.user?.profiles;
  if (!profiles) return "General";
  return profiles
    .split("|")
    .map((p) => singleProfileLabel[p.trim()] || p.trim())
    .join(" & ");
});

const preferredSourceLabel = computed(() => {
  const source = userStore.user?.preferredSource;
  if (source === "ligthroom") return "Lightroom";
  if (source === "web") return "Web";
  return source || "Web";
});

// Invite friends
const inviteEmail = ref("");
const isSendingInvite = ref(false);

const sendInvitation = async () => {
  if (isDemoUser.value) {
    message.warning("This feature is not available for demo accounts");
    return;
  }

  if (!inviteEmail.value) {
    message.warning("Please enter an email address");
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(inviteEmail.value)) {
    message.error("Please enter a valid email address");
    return;
  }

  try {
    isSendingInvite.value = true;
    await api.post("/api/invites/send", {
      email: inviteEmail.value,
    });
    message.success(`Invitation sent to ${inviteEmail.value}!`);
    inviteEmail.value = ""; // Clear input after success
  } catch (error: any) {
    const errorMessage =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to send invitation";
    message.error(errorMessage);
    console.error("Error sending invitation:", error);
  } finally {
    isSendingInvite.value = false;
  }
};

// Preferences
const selectedLanguage = ref("en");
const languageOptions = [
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Português", value: "pt" },
];

const selectedTheme = computed({
  get: () => (isDarkMode.value ? "dark" : "light"),
  set: (value: "dark" | "light") => {
    setTheme(value === "dark");
    message.success(`Theme changed to ${value} mode`);
  },
});

const themeOptions = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
];

// Connections
const isGooglePhotosConnected = computed(() => googlePhotos.isAuthorized.value);

const connectGooglePhotos = async () => {
  try {
    await googlePhotos.authorize();
    message.success("Google Photos connected successfully!");
  } catch (error: any) {
    message.error(error?.message || "Failed to connect Google Photos");
    console.error("Error connecting Google Photos:", error);
  }
};

const disconnectGooglePhotos = () => {
  googlePhotos.signOut();
  message.info("Google Photos disconnected");
};

// Dropbox connection
const isDropboxReady = computed(() => dropbox.isInitialized.value);

const connectDropbox = async () => {
  try {
    await dropbox.initialize();
    message.success("Dropbox connected successfully!");
  } catch (error: any) {
    message.error(error?.message || "Failed to connect Dropbox");
    console.error("Error connecting Dropbox:", error);
  }
};

// Analysis usage (real data from userStore)
const analyzedPhotosUsed = computed(
  () => userStore.user?.usage?.analyzedPhotosUsed || 0,
);
const analyzedPhotosLimit = computed(
  () => userStore.user?.usage?.analyzedPhotosLimit || 0,
);
const analyzedPhotosRemaining = computed(
  () => userStore.user?.usage?.analyzedPhotosRemaining || 0,
);
const analysisPercentage = computed(() => {
  if (analyzedPhotosLimit.value === 0) return 0;
  return Math.min(
    (analyzedPhotosUsed.value / analyzedPhotosLimit.value) * 100,
    100,
  );
});

// Credits usage (real data from userStore)
const creditsUsed = computed(() => userStore.user?.usage?.creditsUsed || 0);
const creditsAvailable = computed(
  () => userStore.user?.usage?.creditsAvailable || 0,
);
const creditsPercentage = computed(() => {
  if (creditsAvailable.value === 0) return 0;
  return Math.min((creditsUsed.value / creditsAvailable.value) * 100, 100);
});

// Purchase modals
const showPhotosModal = ref(false);
const showCreditsModal = ref(false);
const showPlansModal = ref(false);

// Actions
const saveSettings = () => {
  // TODO: Implement save settings
  console.log("Save settings");
};
</script>

<style scoped>
.settings-view {
  /* view-container ya tiene padding y overflow */
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: var(--spacing-2xl);
}

.settings-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.settings-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

/* Section Styles */
.settings-section {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-elevated);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.section-content {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* Setting Item Styles */
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: var(--spacing-2xs);
}

.setting-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.setting-input {
  width: 280px;
}

.setting-select {
  width: 180px;
}

.change-btn {
  white-space: nowrap;
}

/* Connection Item Styles */
.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  transition: var(--transition-fast);
}

.connection-item:hover {
  background-color: var(--bg-elevated);
}

.connection-item.coming-soon {
  opacity: 0.7;
}

.connection-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.connection-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  object-fit: contain;
}

.connection-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.connection-icon-wrapper.instagram {
  background: linear-gradient(
    45deg,
    #f09433,
    #e6683c,
    #dc2743,
    #cc2366,
    #bc1888
  );
}

.connection-icon-wrapper.dropbox {
  background-color: #0061ff;
}

.connection-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
}

.connection-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.connection-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.connection-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* Plan Card Styles */
.current-plan-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
}

.plan-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.plan-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* Storage/Analysis Usage Styles */
.storage-usage-container {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.storage-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.storage-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.storage-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.storage-progress-bar {
  width: 100%;
  height: 10px;
  background-color: var(--bg-surface);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.storage-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background-color: var(--primary-color);
  transition: width 0.3s ease;
}

.storage-progress-fill.warning {
  background-color: var(--warning-color);
}

.storage-progress-fill.critical {
  background-color: var(--error-color);
}

.storage-progress-fill.credits {
  background-color: var(--accent-color);
}

.storage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.storage-remaining {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* Plans Modal Styles */
.plans-modal-card {
  border-radius: var(--radius-lg);
  background-color: var(--bg-surface);
}

.plans-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
}

.plans-modal-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.12),
    rgba(99, 102, 241, 0.12)
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.plans-modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.plans-modal-body {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.plans-modal-highlight {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  text-align: left;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  width: 100%;
}

.plans-modal-highlight--bonus {
  background-color: rgba(250, 204, 21, 0.08);
}

.plans-modal-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}

.plans-modal-link:hover {
  text-decoration: underline;
}

.plans-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* Actions */
.settings-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--spacing-lg);
}

/* Responsive */
@media (max-width: 768px) {
  .settings-view {
    padding: var(--spacing-md);
  }

  .setting-item {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .setting-control {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .setting-input,
  .setting-select {
    width: 100%;
  }

  .connection-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .connection-actions {
    width: 100%;
    justify-content: space-between;
  }

  .storage-footer {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .storage-footer .n-button {
    width: 100%;
  }

  .invite-card-form {
    flex-direction: column;
  }

  .invite-card-input {
    width: 100%;
  }

  .invite-card-form .n-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .settings-header {
    margin-bottom: var(--spacing-lg);
  }

  .settings-title {
    font-size: var(--font-size-xl);
  }

  .section-header {
    padding: var(--spacing-md);
  }

  .section-content {
    padding: var(--spacing-md);
  }
}

/* Invite Friends Card Styles */
.invite-card {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  transition: var(--transition-fast);
}

.invite-card:hover {
  border-color: var(--primary-color-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.invite-card.disabled {
  opacity: 0.6;
  pointer-events: none;
  cursor: not-allowed;
}

.invite-card.disabled:hover {
  border-color: var(--border-color);
  box-shadow: none;
}

.invite-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.invite-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.1),
    rgba(99, 102, 241, 0.1)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.invite-card-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
  flex: 1;
  min-width: 0;
}

.invite-card-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--accent-color);
}

.invite-card-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.invite-card-form {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.invite-card-input {
  flex: 1;
  min-width: 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-xl);
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
