<template>
  <div class="profile-layout">
    <div class="profile-container">
      <div class="profile-content">
        <div class="profile-header">
          <AppLogo layout="horizontal" :with-claim="false" :height="80" />
        </div>

        <div class="profile-form-container">
          <slot />
        </div>

        <div class="profile-footer">
          <p class="footer-text">© 2024 Photoreka. All rights reserved.</p>
        </div>
      </div>
    </div>

    <!-- Background decoration -->
    <div class="profile-background">
      <div class="bg-pattern"></div>
      <div class="bg-gradient"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppLogo from "./AppLogo.vue";
</script>

<style scoped>
.profile-layout {
  position: relative;
  width: 100vw;
  /* background-color: #101014; */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
}

.profile-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.profile-content {
  background-color: var(--bg-body);
  border-radius: 16px;
  border: 1px solid #2c2c32;
  padding: 30px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  width: 100%;
  /* max-height: calc(100vh - 40px);
  overflow-y: auto; */
}

.profile-header {
  text-align: center;
  margin-bottom: 32px;
}

.profile-subtitle {
  margin: 12px 0 0 0;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 400;
}

.profile-form-container {
  margin-bottom: 20px;
}

.profile-footer {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #2c2c32;
}

.footer-text {
  margin: 0;
  font-size: 12px;
  color: #ffffff40;
}

/* Background decoration */
.profile-background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
}

.bg-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(
      circle at 25% 25%,
      rgba(37, 99, 235, 0.1) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 75% 75%,
      rgba(139, 92, 246, 0.1) 0%,
      transparent 50%
    );
  background-size: 800px 800px, 600px 600px;
  background-position: 0 0, 200px 200px;
}

.bg-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(37, 99, 235, 0.05) 0%,
    transparent 70%
  );
}

/* Responsive design */
@media (max-width: 1024px) {
  .profile-container {
    max-width: 90%;
  }

  .profile-content {
    padding: 32px 28px;
  }
}

@media (max-width: 768px) {
  .profile-layout {
    padding: 16px;
  }

  .profile-content {
    padding: 28px 24px;
    border-radius: 12px;
    max-height: calc(100vh - 32px);
  }

  .profile-header {
    margin-bottom: 20px;
  }
}

@media (max-width: 480px) {
  .profile-layout {
    padding: 12px;
  }

  .profile-content {
    padding: 24px 20px;
    border-radius: 8px;
    border: none;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
    max-height: calc(100vh - 24px);
  }

  .profile-header {
    margin-bottom: 16px;
  }
}

/* Animation for content entrance */
.profile-content {
  animation: slideUp 0.6s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
