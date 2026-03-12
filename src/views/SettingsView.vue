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
            <div class="connection-item coming-soon">
              <div class="connection-info">
                <div class="connection-icon-wrapper dropbox">
                  <n-icon size="24" color="#fff">
                    <CloudUploadOutline />
                  </n-icon>
                </div>
                <div class="connection-details">
                  <span class="connection-name">Dropbox</span>
                  <span class="connection-description"
                    >Sync photos from your Dropbox</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag type="info" size="small" round> Coming soon </n-tag>
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
            <h2 class="section-title">Plans & Storage</h2>
          </div>
          <div class="section-content">
            <!-- Current Plan -->
            <div class="plan-card-container">
              <div class="current-plan-card">
                <div class="plan-info">
                  <div class="plan-badge-wrapper">
                    <n-tag type="info" size="small">Current Plan</n-tag>
                  </div>
                  <h3 class="plan-name">Free Plan</h3>
                  <p class="plan-description">
                    Basic features with limited storage
                  </p>
                </div>
                <n-button type="primary" ghost> View Plans </n-button>
              </div>
            </div>

            <!-- Analysis Usage -->
            <div class="storage-usage-container">
              <div class="storage-header">
                <div class="storage-title-row">
                  <n-icon size="20" color="var(--primary-color)">
                    <InProgress />
                  </n-icon>
                  <span class="storage-title">Analyzed Photos</span>
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
                <n-button type="primary" size="small" @click="() => {}">
                  <template #icon>
                    <n-icon>
                      <AddOutline />
                    </n-icon>
                  </template>
                  Add Analysis Credit
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
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NInput, NSelect, NButton, NIcon, NTag, useMessage } from "naive-ui";
import {
  PersonOutline,
  SettingsOutline,
  LinkOutline,
  CloudOutline,
  AddOutline,
  CloudUploadOutline,
  LogoInstagram,
  MailOutline,
  SendOutline,
} from "@vicons/ionicons5";
import { InProgress } from "@vicons/carbon";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import { useUserStore } from "@/stores/userStore";
import { useTheme } from "@/composables/useTheme.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { api } from "@/utils/axios";

// Stores and composables
const userStore = useUserStore();
const { isDarkMode, setTheme } = useTheme();
const googlePhotos = useGooglePhotos();
const message = useMessage();

// Check if user is demo
const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});

// User data (real)
const userName = computed(() => userStore.user?.name || "User");
const userEmail = computed(() => userStore.user?.email || "");

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
.plan-card-container {
  margin-bottom: var(--spacing-md);
}

.current-plan-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--bg-elevated), var(--bg-container));
  border: 1px solid var(--border-color);
}

.plan-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.plan-badge-wrapper {
  margin-bottom: var(--spacing-2xs);
}

.plan-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.plan-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* Storage/Analysis Usage Styles */
.storage-usage-container {
  padding: var(--spacing-lg);
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

.storage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.storage-remaining {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
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

  .current-plan-card {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .current-plan-card .n-button {
    width: 100%;
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
