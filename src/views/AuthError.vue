<template>
  <div class="auth-error-view">
    <n-card class="auth-error-card">
      <div class="error-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>

      <h2 class="error-title">Authentication Failed</h2>
      <p class="error-message">{{ errorMessage }}</p>

      <div class="error-actions">
        <n-button
          v-if="isWhitelistError"
          type="primary"
          size="large"
          @click="router.push('/?requestAccess=true')"
        >
          Request Access
        </n-button>
        <n-button
          v-else
          type="primary"
          size="large"
          @click="router.push('/auth')"
        >
          Try Again
        </n-button>
        <n-button size="large" @click="router.push('/')"> Go to Home </n-button>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const errorMessage = ref(
  "An error occurred during authentication. Please try again."
);

const isWhitelistError = computed(() => {
  return (
    errorMessage.value.toLowerCase().includes("whitelisted") ||
    errorMessage.value.toLowerCase().includes("not allowed") ||
    errorMessage.value.toLowerCase().includes("request access")
  );
});

onMounted(() => {
  const message = route.query.message as string;
  if (message) {
    errorMessage.value = decodeURIComponent(message);
  }
});
</script>

<style scoped>
.auth-error-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
}

.auth-error-card {
  max-width: 500px;
  width: 100%;
  text-align: center;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.error-icon svg {
  color: #ef4444;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px 0;
}

.error-message {
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 32px 0;
  opacity: 0.8;
}

.error-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 300px;
  margin: 0 auto;
}

.error-actions :deep(.n-button) {
  width: 100%;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .error-title {
    font-size: 20px;
  }

  .error-message {
    font-size: 14px;
  }

  .error-icon svg {
    width: 48px;
    height: 48px;
  }
}
</style>
