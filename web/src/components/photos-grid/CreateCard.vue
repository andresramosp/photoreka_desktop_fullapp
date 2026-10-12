<template>
  <div class="create-card surface-create" @click="$emit('click')">
    <div class="create-preview">
      <div class="create-icon-circle">
        <n-icon :size="40" color="var(--primary-color)">
          <AddOutline />
        </n-icon>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title">{{ title }}</h3>
      <p class="card-meta">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup>
import { NIcon } from "naive-ui";
import { AddOutline } from "@vicons/ionicons5";

defineOptions({ name: "CreateCard" });

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
});

defineEmits(["click"]);
</script>

<style scoped>
.create-card {
  color: var(--text-primary);
  border-radius: 16px;
  padding: 20px;
  overflow: hidden;
}

.create-preview {
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.create-icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background-color: rgba(37, 99, 235, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.create-card:hover .create-icon-circle {
  background-color: rgba(37, 99, 235, 0.2);
}

.card-info {
  text-align: center;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  line-height: 1.3;
  color: var(--text-primary);
}

.card-meta {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .create-card {
    padding: 16px;
  }

  .create-preview {
    height: 100px;
    margin-bottom: 12px;
  }
}
</style>
