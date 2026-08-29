<template>
  <!-- Setup: a dialog of its own, the same size and weight as the wizard step
       that launched it. The chat doesn't exist until this is answered. Esc is
       off here for the same reason as the session below, and closing goes
       through the form's own Cancel button. -->
  <n-modal
    :show="show && !started"
    :mask-closable="false"
    :close-on-esc="false"
    transform-origin="center"
    @update:show="(value) => !value && requestClose()"
  >
    <ChatTemplateSetupForm
      v-if="template"
      :template="template"
      :values="values"
      @update:values="values = $event"
      @submit="startSession"
      @cancel="requestClose"
    />
  </n-modal>

  <!-- The session itself. Esc never closes it: the photo dialog opened from
       the transcript listens for Esc on window and doesn't mark the key as
       spent, while naive's own handler here runs earlier (document before
       window), so a single Esc closed the whole session along with the photo.
       Closing is the header button, which still goes through closeConfirm. -->
  <n-modal
    :show="show && started"
    :mask-closable="false"
    :close-on-esc="false"
    transform-origin="center"
    @update:show="(value) => !value && requestClose()"
  >
    <div v-if="template" class="chat-template-modal">
      <header class="ctm-header">
        <div class="ctm-header-title">
          <n-icon
            v-if="template.modal?.icon"
            :size="18"
            class="ctm-header-icon"
          >
            <component :is="template.modal.icon" />
          </n-icon>
          <span class="ctm-title">{{ template.modal?.title }}</span>
          <span v-if="sessionSubtitle" class="ctm-subtitle">
            {{ sessionSubtitle }}
          </span>
        </div>
        <n-button
          quaternary
          size="small"
          title="Close"
          :disabled="isRunningAction"
          @click="requestClose"
        >
          <template #icon>
            <n-icon :size="15"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </header>

      <div
        class="ctm-body"
        :class="{ 'ctm-body--split': template.session?.pinSelectionPanel }"
      >
        <component :is="ChatViewAsync" class="ctm-chat" />

        <ChatTemplateHint
          v-if="template.hint"
          :show="hintVisible"
          :title="template.hint.title"
          :body="template.hint.body"
          @dismiss="dismissHint"
        />
      </div>
    </div>
  </n-modal>

  <!-- Close warning. Only reachable once the session has actually started —
       the setup form has nothing in it worth protecting. -->
  <ChatTemplateConfirmDialog
    v-if="template?.closeConfirm"
    :show="showCloseConfirm"
    :title="template.closeConfirm.title"
    :message="template.closeConfirm.message"
    confirm-label="Close chat"
    confirm-type="error"
    @cancel="showCloseConfirm = false"
    @confirm="confirmClose"
  />
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { NModal, NButton, NIcon, useMessage } from "naive-ui";
import { CloseOutline } from "@vicons/ionicons5";
import ChatTemplateSetupForm from "./ChatTemplateSetupForm.vue";
import ChatTemplateHint from "./ChatTemplateHint.vue";
import ChatTemplateConfirmDialog from "./ChatTemplateConfirmDialog.vue";
import { getChatTemplate } from "@/config/chatTemplates";
import { provideChatTemplateSession } from "@/composables/useChatTemplate";
import { useChatStore } from "@/stores/chat.js";

defineOptions({ name: "ChatTemplateModal" });

// Async: the portfolio bundle has no reason to carry the whole chat until the
// user actually opens a chat-assisted session.
const ChatViewAsync = defineAsyncComponent(
  () => import("@/views/ChatView.vue"),
);

const props = defineProps({
  show: { type: Boolean, default: false },
  /** Key into the chat template registry. */
  templateId: { type: String, required: true },
  /** Host-supplied extras handed to buildPrompt and to the panel action. */
  context: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["update:show", "completed"]);

const message = useMessage();
const chatStore = useChatStore();

const template = computed(() => getChatTemplate(props.templateId));
const config = computed(() => template.value?.session ?? {});

const values = ref({});
const started = ref(false);
const pendingPrompt = ref(null);
const isRunningAction = ref(false);
const hintVisible = ref(false);
const showCloseConfirm = ref(false);

/** Seed the form from the template's own defaults. */
const initValues = () => {
  const next = {};
  for (const field of template.value?.setup?.fields ?? []) {
    const fallback =
      field.type === "slider"
        ? field.min
        : field.type === "collections"
          ? []
          : "";
    const preset =
      typeof field.default === "function" ? field.default() : field.default;
    next[field.key] = preset ?? fallback;
  }
  values.value = next;
};

/** The intelligence-mode field has no static default — it comes from the server. */
const applyModeDefault = () => {
  const field = (template.value?.setup?.fields ?? []).find(
    (f) => f.type === "intelligenceMode",
  );
  if (!field || values.value[field.key]) return;
  values.value = {
    ...values.value,
    [field.key]:
      chatStore.selectedModeId ??
      chatStore.defaultModeId ??
      chatStore.chatModes[0]?.id ??
      null,
  };
};

const sessionSubtitle = computed(() => {
  const name = values.value.name;
  return typeof name === "string" && name.trim() ? name.trim() : "";
});

// ── Session lifecycle ───────────────────────────────────────────────────────

const startSession = () => {
  if (!template.value) return;

  // The chat store is a singleton shared with the dashboard's chat panel — this
  // session must never continue whatever was open there.
  chatStore.startNewConversation();

  const modeField = config.value.modeField;
  if (modeField && values.value[modeField]) {
    chatStore.setSelectedMode(values.value[modeField]);
  }

  pendingPrompt.value = {
    text: template.value.buildPrompt(values.value, props.context),
    display: template.value.maskMessage?.(values.value) ?? null,
  };
  started.value = true;
};

const requestClose = () => {
  if (isRunningAction.value) return;
  if (started.value && template.value?.closeConfirm) {
    showCloseConfirm.value = true;
    return;
  }
  emit("update:show", false);
};

const confirmClose = () => {
  showCloseConfirm.value = false;
  emit("update:show", false);
};

// ── Panel call to action ────────────────────────────────────────────────────

const panelAction = computed(() => {
  const action = template.value?.panelAction;
  if (!action) return null;
  const resolve = (value) =>
    typeof value === "function" ? value(values.value) : value;
  return {
    label: action.label,
    icon: action.icon ?? null,
    minPhotos: resolve(action.minPhotos) ?? 1,
    target: resolve(action.target) ?? null,
    hint: action.hint ?? null,
    confirm: action.confirm
      ? {
          storageKey: action.confirm.storageKey,
          title: action.confirm.title,
          message: resolve(action.confirm.message),
        }
      : null,
  };
});

const runPanelAction = async (photoIds) => {
  const action = template.value?.panelAction;
  if (!action?.run || isRunningAction.value) return;

  isRunningAction.value = true;
  try {
    const result = await action.run({
      photoIds,
      values: values.value,
      context: props.context,
    });
    if (result?.successMessage) message.success(result.successMessage);
    emit("completed", result);
    if (result?.close !== false) emit("update:show", false);
  } catch (error) {
    console.error("[ChatTemplateModal] panel action failed:", error);
    message.error(
      error?.response?.data?.error || error?.message || "Something went wrong",
    );
  } finally {
    isRunningAction.value = false;
  }
};

// `context` is deliberately absent: both places that need it (buildPrompt and
// the panel action) are called from here, where `props.context` is read live.
// Handing the injected consumers a snapshot would only invite a stale read.
provideChatTemplateSession({
  template,
  config,
  values,
  pendingPrompt,
  panelAction,
  isRunningAction,
  runPanelAction,
});

// ── Contextual help, once the assistant has actually answered ───────────────

const dismissHint = () => {
  hintVisible.value = false;
  const key = template.value?.hint?.storageKey;
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Private mode: the hint just shows again next time.
  }
};

watch(
  () =>
    chatStore.messages.filter((m) => m.role === "assistant" && !m.isError)
      .length,
  (replies) => {
    if (!started.value || replies < 1 || hintVisible.value) return;
    const key = template.value?.hint?.storageKey;
    if (key && localStorage.getItem(key) === "1") return;
    hintVisible.value = true;
  },
);

// ── Open / close ────────────────────────────────────────────────────────────

watch(
  () => props.show,
  async (open) => {
    if (open) {
      started.value = false;
      hintVisible.value = false;
      showCloseConfirm.value = false;
      pendingPrompt.value = null;
      initValues();
      // Needed by the setup form, and it settles selectedModeId before ChatView
      // mounts — otherwise its own fetch would overwrite the chosen mode.
      if (chatStore.chatModes.length === 0) await chatStore.fetchModes();
      applyModeDefault();
      return;
    }

    // Closing hands the shared chat store back in a clean state. The session's
    // conversation is already persisted, so it stays in the history either way.
    started.value = false;
    hintVisible.value = false;
    showCloseConfirm.value = false;
    pendingPrompt.value = null;
    chatStore.startNewConversation();
  },
);
</script>

<style scoped>
.chat-template-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1280px, 95vw);
  height: min(880px, 90vh);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-body);
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────── */
.ctm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  flex-shrink: 0;
  min-height: 44px;
  padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-xs)
    var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.ctm-header-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.ctm-header-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.ctm-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
}

.ctm-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 1px solid var(--border-color);
  padding-left: var(--spacing-sm);
}

/* ── Body ───────────────────────────────────────────────── */
.ctm-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* The hint is a sibling of the chat, so it resolves against the whole body —
   including the 300px selection column a pinned session adds on the right. This
   hands it that width so it lands beside the panel, not over it. */
.ctm-body--split {
  --tpl-hint-offset-right: 300px;
}

.ctm-chat {
  height: 100%;
}

/* A bubble's default width is a *reading* measure (680px), but a session like
   this one is mostly photo groups, and those measure in pixels: five photos
   split into single-photo groups need ~718px of bubble content, so at the
   reading measure the fifth one wraps to a second line. Here the transcript
   also gives up 300px to the pinned selection panel, so the bubble gets its own
   wider measure — a multiple of the 48px step, with room to spare around the
   five columns. Only inside the modal: the standalone chat keeps its measure. */
.ctm-body :deep(.message-row) {
  --bubble-measure: 760px;
}

@media (max-width: 768px) {
  .chat-template-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
  }

  .ctm-subtitle {
    display: none;
  }
}
</style>
