<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Costs</h1>
      <p>Track LLM API costs and usage breakdown</p>
    </div>
    <div class="placeholder-card">
      <div class="placeholder-icon">
        <n-icon size="40" color="#6366f1"><WalletOutline /></n-icon>
      </div>
      <h3>Coming soon</h3>
      <p>
        Usage breakdown by user and process, billing summary, and cost trends.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { WalletOutline } from "@vicons/ionicons5";
</script>

<style scoped>
.admin-section {
  max-width: 960px;
  margin: 0 auto;
}
.section-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}
.section-header p {
  margin: 0 0 24px;
  color: #94a3b8;
  font-size: 14px;
}
.placeholder-card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 56px 32px;
  text-align: center;
}
.placeholder-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}
.placeholder-card h3 {
  margin: 0 0 6px;
  color: #334155;
  font-size: 16px;
  font-weight: 600;
}
.placeholder-card p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  max-width: 340px;
  margin: 0 auto;
}
</style>
