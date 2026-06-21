<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :bordered="false"
    :closable="true"
    :mask-closable="true"
    style="max-width: 1020px; max-height: 88vh"
    @update:show="$emit('update:show', $event)"
  >
    <div v-if="loading" class="img-health-loading">
      <SpiralGridLoader variant="primary" :size="48" />
      <p>Running image health check...</p>
    </div>

    <template v-else-if="report">
      <div class="img-health-summary">
        <div
          class="img-health-stat"
          :class="report.unhealthyPhotos === 0 ? 'stat-ok' : 'stat-warn'"
        >
          <span class="stat-number">{{ report.totalPhotos }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="img-health-stat stat-ok">
          <span class="stat-number">{{ report.healthyPhotos }}</span>
          <span class="stat-label">Healthy</span>
        </div>
        <div
          class="img-health-stat"
          :class="report.unhealthyPhotos > 0 ? 'stat-error' : 'stat-ok'"
        >
          <span class="stat-number">{{ report.unhealthyPhotos }}</span>
          <span class="stat-label">Unhealthy</span>
        </div>
      </div>

      <div class="img-health-verdict">
        <n-tag v-if="report.unhealthyPhotos === 0" type="success" size="small">
          All thumbnails returned bytes from R2
        </n-tag>
        <n-tag v-else type="error" size="small">
          {{ report.unhealthyPhotos }} unhealthy image{{
            report.unhealthyPhotos !== 1 ? "s" : ""
          }}
        </n-tag>
      </div>

      <div class="img-health-meta">
        <span>Checked at: {{ formatDate(report.checkedAt) }}</span>
      </div>

      <div class="img-health-table-wrapper">
        <n-data-table
          :columns="columns"
          :data="report.unhealthyRows"
          :row-key="(row: UserImageHealthRow) => row.photoId"
          :bordered="false"
          size="small"
          :max-height="430"
          striped
        />
      </div>

      <p v-if="report.unhealthyRows.length === 0" class="img-health-empty">
        No unhealthy images found.
      </p>
    </template>

    <div v-else-if="error" class="img-health-error">
      <p>Failed to run image health check</p>
      <n-button size="small" @click="$emit('retry')">Retry</n-button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import { NModal, NTag, NButton, NDataTable, NText, NIcon } from "naive-ui";
import type { DataTableColumn } from "naive-ui";
import { Copy } from "@vicons/carbon";
import SpiralGridLoader from "../SpiralGridLoader.vue";

export type ImageCheckStatus = "missing" | "timeout" | "error";

export interface UserImageHealthRow {
  photoId: number;
  thumbnailName: string;
  originalFileName: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  confirmed: boolean | null;
  checkStatus: ImageCheckStatus;
  httpStatus: number | null;
  bytesReceived: number;
  latencyMs: number;
  error: string | null;
}

export interface UserImageHealthReport {
  userId: number;
  totalPhotos: number;
  healthyPhotos: number;
  unhealthyPhotos: number;
  checkedAt: string;
  unhealthyRows: UserImageHealthRow[];
}

const props = defineProps<{
  show: boolean;
  title?: string;
  loading: boolean;
  report: UserImageHealthReport | null;
  error: boolean;
}>();

defineEmits<{
  "update:show": [value: boolean];
  retry: [];
}>();

const columns = computed<DataTableColumn<UserImageHealthRow>[]>(() => [
  {
    title: "Photo ID",
    key: "photoId",
    width: 80,
    sorter: (a, b) => a.photoId - b.photoId,
  },
  {
    title: "Thumbnail (R2 key)",
    key: "thumbnailName",
    minWidth: 220,
    render(row) {
      return h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
          },
        },
        [
          h(
            "span",
            {
              style: {
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
              title: row.thumbnailName,
            },
            row.thumbnailName,
          ),
          h(
            "button",
            {
              style: {
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                color: "#0969da",
                fontSize: "16px",
              },
              title: "Copy to clipboard",
              onClick: () => copyToClipboard(row.thumbnailName),
            },
            [
              h(
                NIcon,
                { size: 18 },
                {
                  default: () => h(Copy),
                },
              ),
            ],
          ),
        ],
      );
    },
  },
  {
    title: "Original File",
    key: "originalFileName",
    minWidth: 200,
    ellipsis: {
      tooltip: true,
    },
    render(row) {
      return row.originalFileName || "-";
    },
  },
  {
    title: "Created",
    key: "createdAt",
    width: 160,
    render(row) {
      return formatDate(row.createdAt);
    },
  },
  {
    title: "Deleted",
    key: "deletedAt",
    width: 160,
    render(row) {
      if (!row.deletedAt) return "-";
      return formatDate(row.deletedAt);
    },
  },
  {
    title: "Confirmed",
    key: "confirmed",
    width: 96,
    render(row) {
      const text =
        row.confirmed === null ? "legacy" : row.confirmed ? "yes" : "no";
      return h(
        NTag,
        {
          size: "small",
          type: row.confirmed === false ? "warning" : "default",
        },
        { default: () => text },
      );
    },
  },
  {
    title: "Status",
    key: "checkStatus",
    width: 100,
    render(row) {
      const cfg: Record<
        ImageCheckStatus,
        { label: string; type: "error" | "warning" | "default" }
      > = {
        missing: { label: "Missing", type: "error" },
        timeout: { label: "Timeout", type: "warning" },
        error: { label: "Check Error", type: "default" },
      };
      const c = cfg[row.checkStatus] ?? {
        label: row.checkStatus,
        type: "default",
      };
      return h(
        NTag,
        { size: "small", type: c.type },
        { default: () => c.label },
      );
    },
  },
  {
    title: "HTTP",
    key: "httpStatus",
    width: 80,
    render(row) {
      return row.httpStatus ?? "-";
    },
  },
  {
    title: "Bytes",
    key: "bytesReceived",
    width: 80,
  },
  {
    title: "Latency",
    key: "latencyMs",
    width: 90,
    render(row) {
      return `${row.latencyMs}ms`;
    },
  },
  {
    title: "Error",
    key: "error",
    minWidth: 180,
    ellipsis: {
      tooltip: true,
    },
    render(row) {
      return h(NText, { depth: 3 }, { default: () => row.error || "-" });
    },
  },
]);

function copyToClipboard(text: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      console.log("Copied to clipboard");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
    });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}
</script>

<style scoped>
.img-health-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 14px;
}

.img-health-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.img-health-stat {
  flex: 1;
  text-align: center;
  padding: 14px 8px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
}

.img-health-stat.stat-ok {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.img-health-stat.stat-warn {
  background: #fffbeb;
  border-color: #fde68a;
}

.img-health-stat.stat-error {
  background: #fef2f2;
  border-color: #fecaca;
}

.stat-number {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.img-health-verdict {
  margin-bottom: 8px;
}

.img-health-meta {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 12px;
}

.img-health-table-wrapper {
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  overflow: hidden;
}

.img-health-empty {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}

.img-health-error {
  text-align: center;
  padding: 24px 0;
  color: #ef4444;
}
</style>
