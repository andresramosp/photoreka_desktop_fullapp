<template>
  <div class="maintenance-layout">
    <div class="maintenance-container">
      <div class="maintenance-content">
        <!-- Logo -->
        <div class="maintenance-logo">
          <router-link to="/" class="logo-link" aria-label="Home">
            <AppLogo layout="horizontal" :height="50" />
          </router-link>
        </div>

        <!-- Maintenance Icon -->
        <div class="maintenance-icon">
          <n-icon size="80" color="var(--warning-color)">
            <BuildOutline />
          </n-icon>
        </div>

        <!-- Title -->
        <h1 class="maintenance-title">We are under maintenance</h1>

        <!-- Description -->
        <p class="maintenance-description">
          Photoreka Curation Lab is temporarily out of service for maintenance
          and improvements. We will be back soon with new features to enhance
          your curatorial experience.
        </p>

        <!-- Features info -->
        <div class="maintenance-features">
          <div class="feature-item">
            <n-icon size="20" color="var(--success-color)">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>Performance improvements</span>
          </div>
          <div class="feature-item">
            <n-icon size="20" color="var(--success-color)">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>New curation tools</span>
          </div>
          <div class="feature-item">
            <n-icon size="20" color="var(--success-color)">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>Enhanced experience</span>
          </div>
        </div>

        <!-- Back to home button -->
        <div class="maintenance-actions">
          <n-button type="primary" size="large" @click="goToLanding">
            <template #icon>
              <n-icon><HomeOutline /></n-icon>
            </template>
            Back to home
          </n-button>

          <n-button
            type="info"
            size="large"
            text
            @click="goToPlayground"
            v-if="!isMobileDevice()"
          >
            <template #icon>
              <n-icon><Workspace /></n-icon>
            </template>
            Try free Canvas
          </n-button>
        </div>

        <!-- Contact info -->
        <div class="maintenance-contact">
          <p class="contact-text">
            Need urgent help? Contact us at
            <n-button text type="info" @click="openEmail">
              hello@photoreka.com
            </n-button>
          </p>
        </div>
      </div>
    </div>

    <!-- Background decoration -->
    <div class="maintenance-background">
      <div class="bg-pattern"></div>
      <div class="bg-gradient"></div>
      <div class="decoration-circle decoration-1"></div>
      <div class="decoration-circle decoration-2"></div>
      <div class="decoration-circle decoration-3"></div>
    </div>
  </div>
</template>
<script setup>
import { NIcon, NButton } from "naive-ui";
import {
  BuildOutline,
  CheckmarkCircleOutline,
  HomeOutline,
} from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import { useMaintenanceMode } from "@/composables/useMaintenanceMode";
import AppLogo from "@/components/AppLogo.vue";
import { Workspace } from "@vicons/carbon";

const router = useRouter();
const { isBypassActive, clearBypass } = useMaintenanceMode();

const isMobileDevice = () => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768
  );
};

const goToLanding = () => {
  router.push("/");
};

const goToPlayground = () => {
  router.push("/canvas-playground");
};

const openEmail = () => {
  window.location.href = "mailto:hello@photoreka.com";
};

const handleClearBypass = () => {
  clearBypass();
  // Optionally reload to apply the change immediately
  window.location.reload();
};
</script>

<style scoped>
.maintenance-layout {
  width: 100vw;
  height: 100vh;
  background-color: var(--bg-body);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.maintenance-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
}

.maintenance-content {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-2xl);
  padding: var(--spacing-6xl);
  text-align: center;
  box-shadow: var(--shadow-xl);
}

.maintenance-logo {
  margin-bottom: var(--spacing-4xl);
}

.logo-link {
  display: inline-block;
  transition: var(--transition-fast);
}

.logo-link:hover {
  transform: scale(1.05);
}

.logo-image {
  height: 40px;
  width: auto;
}

.maintenance-icon {
  margin-bottom: var(--spacing-3xl);
  display: flex;
  justify-content: center;
}

.maintenance-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2xl) 0;
  line-height: var(--line-height-tight);
}

.maintenance-description {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-4xl) 0;
}

.maintenance-features {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-5xl);
  text-align: left;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

.maintenance-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-4xl);
}

.maintenance-contact {
  padding-top: var(--spacing-3xl);
  border-top: 1px solid var(--border-color);
}

.contact-text {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin: 0;
}

/* Background decoration */
.maintenance-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-pattern {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: radial-gradient(
      circle at 20% 50%,
      rgba(37, 99, 235, 0.03) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 80% 20%,
      rgba(139, 92, 246, 0.03) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 40% 80%,
      rgba(245, 158, 11, 0.02) 0%,
      transparent 50%
    );
}

.bg-gradient {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    135deg,
    transparent 0%,
    rgba(37, 99, 235, 0.02) 50%,
    transparent 100%
  );
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(
    45deg,
    rgba(37, 99, 235, 0.08),
    rgba(139, 92, 246, 0.04)
  );
}

.decoration-1 {
  width: 200px;
  height: 200px;
  top: 10%;
  left: 10%;
  animation-delay: 0s;
}

.decoration-2 {
  width: 150px;
  height: 150px;
  top: 60%;
  right: 15%;
  animation-delay: -3s;
}

.decoration-3 {
  width: 100px;
  height: 100px;
  bottom: 20%;
  left: 20%;
}

/* Responsive design */
@media (max-width: 768px) {
  .maintenance-layout {
    padding: var(--spacing-lg);
  }

  .maintenance-content {
    padding: var(--spacing-4xl);
  }

  .maintenance-title {
    font-size: var(--font-size-3xl);
  }

  .maintenance-description {
    font-size: var(--font-size-base);
  }

  .maintenance-features {
    text-align: center;
  }

  .feature-item {
    justify-content: center;
  }

  .maintenance-actions {
    flex-direction: column;
  }

  .decoration-circle {
    opacity: 0.2;
  }
}

@media (max-width: 480px) {
  .maintenance-content {
    padding: var(--spacing-3xl);
  }

  .maintenance-title {
    font-size: var(--font-size-2xl);
  }

  .maintenance-actions {
    gap: var(--spacing-md);
  }
}
</style>
