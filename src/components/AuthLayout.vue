<template>
  <div class="auth-layout">
    <div class="auth-container">
      <div class="auth-content">
        <div class="auth-header">
          <div class="logo-wrapper" aria-label="Inicio">
            <AppLogo
              layout="horizontal"
              :with-claim="true"
              :height="75"
              :click-to-home="true"
            />
          </div>
        </div>

        <div class="auth-form-wrapper">
          <div class="auth-form-container">
            <slot />
          </div>
        </div>

        <div class="auth-footer">
          <p class="footer-text">© 2026 Photoreka. All rights reserved.</p>
        </div>
      </div>
    </div>

    <!-- Background decoration -->
    <div class="auth-background">
      <div class="bg-pattern"></div>
      <div class="bg-gradient"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppLogo from "./AppLogo.vue";
</script>

<style scoped>
.auth-layout {
  width: 100vw;
  height: 100vh;
  /* background-color: #101014; */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.auth-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-content {
  background-color: var(--bg-body);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  width: 100%;
}

.auth-header {
  text-align: center;
  margin-bottom: 12px;
}

.logo-wrapper {
  display: inline-block;
  cursor: pointer;
  color: inherit;
}

.logo-wrapper:focus {
  outline: 2px solid rgba(37, 99, 235, 0.35);
  border-radius: 8px;
}

.auth-subtitle {
  margin: 8px 0 0 0;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 400;
}

.auth-form-wrapper {
  margin-bottom: 12px;
}

.auth-form-container {
  /* Contenedor del formulario */
}

.auth-footer {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.footer-text {
  margin: 0;
  font-size: 12px;
  color: #ffffff40;
}

/* Background decoration */
.auth-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.bg-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    radial-gradient(
      circle at 25% 25%,
      rgba(37, 99, 235, 0.1) 0%,
      transparent 50%
    ),
    radial-gradient(circle at 75% 75%, var(--bg-surface) 0%, transparent 50%);
  background-size:
    800px 800px,
    600px 600px;
  background-position:
    0 0,
    200px 200px;
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
@media (max-width: 768px) {
  .auth-layout {
    padding: 16px;
  }

  .auth-content {
    padding: 28px 24px;
    border-radius: 12px;
  }

  .auth-header {
    margin-bottom: 20px;
  }
}

@media (max-width: 480px) {
  .auth-layout {
    padding: 0;
    align-items: stretch;
  }

  .auth-container {
    max-width: 100%;
    height: 100vh;
    height: 100dvh; /* Dynamic viewport height para móviles */
  }

  .auth-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px 20px 20px 20px;
    border-radius: 0;
    border: none;
    box-shadow: none;
    animation: none !important;
  }

  .auth-header {
    flex-shrink: 0;
    margin-bottom: 20px;
    margin-top: 16px;
  }

  .logo-link :deep(svg),
  .logo-link :deep(img) {
    height: 65px !important;
    width: auto;
  }

  .auth-form-wrapper {
    flex: 1;
    min-height: 0;
    margin-bottom: 16px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .auth-footer {
    flex-shrink: 0;
    padding-top: 16px;
    padding-bottom: 16px;
  }
}

/* Animation for content entrance - only desktop */
@media (min-width: 481px) {
  .auth-content {
    animation: slideUp 0.6s ease-out;
  }
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
