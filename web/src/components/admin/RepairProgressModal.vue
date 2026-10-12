<template>
  <n-modal
    :show="show"
    preset="card"
    title="Repair Tasks"
    :bordered="false"
    :closable="true"
    :mask-closable="true"
    style="max-width: 520px"
    @update:show="$emit('update:show', $event)"
  >
    <div v-if="sortedTasks.length === 0" class="repair-empty">
      <p>No repair tasks</p>
    </div>

    <div v-else class="repair-task-list">
      <div
        v-for="task in sortedTasks"
        :key="task.taskId"
        class="repair-task-card"
        :class="`task-${task.status}`"
      >
        <div class="task-top">
          <n-tag :type="tagType(task.status)" size="small">
            {{ taskLabel(task.type) }}
          </n-tag>
          <span class="task-status-badge" :class="`status-${task.status}`">
            {{ task.status }}
          </span>
        </div>
        <div class="task-message">{{ task.message }}</div>
        <n-progress
          v-if="task.total > 0"
          type="line"
          :percentage="Math.round((task.current / task.total) * 100)"
          :status="progressStatus(task.status)"
          :show-indicator="task.status === 'running'"
          style="margin-top: 8px"
        />
        <div
          v-if="task.status === 'running' && task.total > 1"
          class="task-count"
        >
          {{ task.current }} / {{ task.total }}
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NModal, NTag, NProgress } from "naive-ui";

export interface RepairTaskInfo {
  taskId: string;
  type: string;
  status: string;
  current: number;
  total: number;
  message: string;
}

const props = defineProps<{
  show: boolean;
  tasks: RepairTaskInfo[];
}>();

defineEmits<{
  "update:show": [value: boolean];
}>();

const sortedTasks = computed(() => {
  const order: Record<string, number> = {
    running: 0,
    failed: 1,
    completed: 2,
  };
  return [...props.tasks].sort(
    (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3),
  );
});

function tagType(
  status: string,
): "info" | "success" | "error" | "warning" | "default" {
  if (status === "running") return "info";
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "default";
}

function taskLabel(type: string): string {
  switch (type) {
    case "global-clip":
      return "CLIP Embeddings";
    case "global-embeddings":
      return "Tag & Chunk Embeddings";
    case "user-retry":
      return "User Repair";
    default:
      return type;
  }
}

function progressStatus(status: string): "default" | "success" | "error" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "default";
}
</script>

<style scoped>
.repair-empty {
  text-align: center;
  padding: 32px 0;
  color: #94a3b8;
  font-size: 14px;
}

.repair-task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.repair-task-card {
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #f8fafc;
}

.repair-task-card.task-running {
  border-color: #93c5fd;
  background: #eff6ff;
}

.repair-task-card.task-completed {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.repair-task-card.task-failed {
  border-color: #fecaca;
  background: #fef2f2;
}

.task-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.task-status-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.status-running {
  color: #3b82f6;
}

.status-completed {
  color: #22c55e;
}

.status-failed {
  color: #ef4444;
}

.task-message {
  font-size: 13px;
  color: #475569;
  line-height: 1.4;
}

.task-count {
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
  margin-top: 4px;
}
</style>
