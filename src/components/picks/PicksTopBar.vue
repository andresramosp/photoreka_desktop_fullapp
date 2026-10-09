<script setup lang="ts">
import AppLogo from "@/components/AppLogo.vue";

defineProps<{ solid?: boolean }>();
</script>

<template>
  <header class="pk-topbar" :class="{ 'is-solid': solid }">
    <div class="pk-brand">
      <AppLogo
        layout="horizontal"
        size="tiny"
        :click-to-home="true"
        theme="dark"
      />
      <span class="pk-brand-divider" />
      <span class="pk-brand-name">Picks</span>
    </div>
    <div class="pk-topbar-actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.pk-topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--pk-topbar-h);
  padding: 0 clamp(16px, 4vw, 48px);
  transition:
    background 0.4s var(--pk-ease),
    border-color 0.4s var(--pk-ease);
  border-bottom: 1px solid transparent;
}

.pk-topbar.is-solid {
  background: rgba(7, 7, 10, 0.72);
  backdrop-filter: blur(18px) saturate(1.3);
  border-bottom-color: var(--pk-line);
}

.pk-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pk-brand-divider {
  width: 1px;
  height: 18px;
  background: var(--pk-line-strong);
}

.pk-brand-name {
  font-family: var(--pk-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.01em;
  line-height: 1;
  background: var(--pk-gold-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  padding-right: 2px;
}

.pk-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
