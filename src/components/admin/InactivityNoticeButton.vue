<template>
  <n-button
    :size="compact ? 'tiny' : 'small'"
    type="error"
    :secondary="!compact"
    :quaternary="compact"
    :disabled="users.length === 0"
    :title="compact ? 'Send deletion notice' : undefined"
    @click.stop="showConfirm = true"
  >
    <template #icon>
      <n-icon :size="compact ? 16 : 15"><MailIcon /></n-icon>
    </template>
    <template v-if="!compact">
      Send deletion notice{{ isSingle ? "" : ` (${users.length})` }}
    </template>
  </n-button>

  <n-modal v-model:show="showConfirm" preset="dialog" type="warning">
    <template #header>Send deletion notice</template>
    <p v-if="isSingle">
      <strong>{{ users[0].name }}</strong> ({{ users[0].email }}) will receive
      an email warning that their account and photos will be deleted in 30 days
      unless they sign in.
    </p>
    <p v-else>
      <strong>{{ users.length }}</strong> users will receive an email warning
      that their account and photos will be deleted in 30 days unless they sign
      in.
    </p>
    <p class="notice-hint">
      The server re-checks every user (no payments, inactive for 6+ months,
      more than 10 photos) and skips anyone who no longer qualifies.
    </p>
    <template #action>
      <n-button :disabled="sending" @click="showConfirm = false">
        Cancel
      </n-button>
      <n-button type="error" :loading="sending" @click="send">
        Send {{ isSingle ? "email" : `${users.length} emails` }}
      </n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NButton, NIcon, NModal, useMessage } from "naive-ui";
import { MailOutline as MailIcon } from "@vicons/ionicons5";
import { api } from "../../utils/axios";

interface NoticeResult {
  sent: number[];
  skipped: { userId: number; reason: string }[];
  failed: { userId: number; error: string }[];
}

const props = defineProps<{
  users: { id: number; name: string; email: string }[];
  /** Icon-only variant for table rows */
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: "sent", result: NoticeResult): void;
}>();

const SKIP_REASON_LABELS: Record<string, string> = {
  not_found: "user not found",
  admin: "admin account",
  untracked: "activity not tracked for this account",
  paid: "user has paid",
  recently_active: "active in the last 6 months",
  few_photos: "10 photos or fewer",
  already_notified: "already notified",
};

const message = useMessage();
const showConfirm = ref(false);
const sending = ref(false);
const isSingle = computed(() => props.users.length === 1);

function notify(data: NoticeResult) {
  if (isSingle.value) {
    if (data.sent.length) message.success("Deletion notice sent");
    else if (data.skipped.length) {
      const reason = data.skipped[0].reason;
      message.warning(`Not sent: ${SKIP_REASON_LABELS[reason] ?? reason}`);
    } else message.error("Failed to send deletion notice");
    return;
  }

  const parts = [`${data.sent.length} sent`];
  if (data.skipped.length) parts.push(`${data.skipped.length} skipped`);
  if (data.failed.length) parts.push(`${data.failed.length} failed`);
  const text = `Deletion notices: ${parts.join(", ")}`;
  if (data.failed.length) message.warning(text);
  else message.success(text);
}

async function send() {
  sending.value = true;
  try {
    const { data } = await api.post<NoticeResult>(
      "/api/admin/users/inactivity-notices",
      { userIds: props.users.map((u) => u.id) },
    );
    notify(data);
    showConfirm.value = false;
    emit("sent", data);
  } catch {
    message.error("Failed to send deletion notices");
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.notice-hint {
  font-size: 12px;
  color: #94a3b8;
}
</style>
