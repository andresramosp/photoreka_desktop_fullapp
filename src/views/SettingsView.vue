<!-- <template>
  <div class="settings-container">
    <n-grid :cols="1" :y-gap="24">
      <n-grid-item>
        <n-card title="Account" class="settings-card">
          <n-space vertical size="large">
            <div class="setting-item">
              <div class="setting-label">Subscription Plan</div>
              <n-button disabled type="primary" @click="goToPlan">
                Manage Plan
              </n-button>
            </div>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="General Settings" class="settings-card">
          <n-space vertical size="large">
            <div class="setting-item">
              <div class="setting-label">Application Name</div>
              <n-input placeholder="Enter application name" value="Dashboard" />
            </div>

            <div class="setting-item">
              <div class="setting-label">Theme</div>
              <n-select
                :options="themeOptions"
                default-value="dark"
                placeholder="Select theme"
              />
            </div>

            <div class="setting-item">
              <div class="setting-label">Language</div>
              <n-select
                :options="languageOptions"
                default-value="en"
                placeholder="Select language"
              />
            </div>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="Security" class="settings-card">
          <n-space vertical size="large">
            <div class="setting-item">
              <div class="setting-label">Two-Factor Authentication</div>
              <n-switch :default-value="false" />
            </div>

            <div class="setting-item">
              <div class="setting-label">Session Timeout (minutes)</div>
              <n-input-number :default-value="30" :min="5" :max="120" />
            </div>

            <n-button type="primary" size="large"> Save Settings </n-button>
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

defineOptions({
  name: "SettingsView",
});

const router = useRouter();

const goToPlan = () => {
  router.push("/plan");
};

const themeOptions = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
  { label: "Auto", value: "auto" },
];

const languageOptions = [
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
];
</script>

<style scoped>
.settings-container {
  margin: 0 auto;
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-width: 1000px;
  justify-content: center;
}

.settings-card {
  background-color: #18181c !important;
  border: 1px solid #2c2c32 !important;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.setting-label {
  color: var(--text-secondary);
  font-weight: 500;
  min-width: 200px;
}
</style> -->

<template>
  <div class="empty-view">
    <div class="empty-content">
      <n-icon size="64" color="#6b7280">
        <svg viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41c0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"
          />
        </svg>
      </n-icon>
      <h2 class="empty-title">Settings</h2>
      <p class="empty-description">Settings view coming soon...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Help logic here
</script>

<style scoped>
.empty-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.empty-content {
  text-align: center;
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 8px 0;
}

.empty-description {
  font-size: 16px;
  color: #ffffff73;
  margin: 0;
}
</style>
