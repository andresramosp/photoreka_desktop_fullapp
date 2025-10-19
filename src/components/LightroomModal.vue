<template>
  <n-modal
    v-model:show="isVisible"
    :style="{ width: '700px', maxWidth: '90vw' }"
  >
    <n-card
      title="Lightroom Plugin Installation"
      :bordered="false"
      size="huge"
      role="dialog"
      aria-modal="true"
      style="background-color: #1a1a1f; border: 1px solid #2c2c32"
    >
      <template #header-extra>
        <n-button text @click="isVisible = false">
          <n-icon size="20">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
              />
            </svg>
          </n-icon>
        </n-button>
      </template>

      <div class="lightroom-modal-content">
        <!-- Header Section -->

        <!-- Screenshot -->
        <div class="screenshot-container">
          <img
            src="/src/assets/onBoarding/lightroom_logo.png"
            alt="Lightroom Plugin Screenshot"
            class="plugin-screenshot"
          />
          <p class="screenshot-caption">
            Photoreka export option in Lightroom's plug-in menu.
          </p>
        </div>

        <!-- Installation Steps -->
        <div class="installation-steps">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Download the Plugin</h4>
              <p>
                Click the button below to download the Photoreka plugin for
                Lightroom.
              </p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Unzip the File</h4>
              <p>
                Extract the <code>Photoreka.lrplugin.zip</code> file to a
                location on your computer.
              </p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Install in Lightroom</h4>
              <p>
                Open Lightroom, go to <strong>File → Plug-in Manager</strong>,
                click <strong>Add</strong> and select the
                <code>Photoreka.lrplugin</code> folder.
              </p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">4</div>
            <div class="step-content">
              <h4>Export to Photoreka</h4>
              <p>
                Select photos, go to <strong>File → Plugin Extras</strong>, and
                choose <strong>Export to Photoreka</strong> from the options.
              </p>
            </div>
          </div>
        </div>

        <!-- Download Button -->
        <div class="modal-actions">
          <n-button
            type="primary"
            size="large"
            @click="downloadPlugin"
            class="download-plugin-btn"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7l7-7z"
                  />
                </svg>
              </n-icon>
            </template>
            Download Lightroom Plugin
          </n-button>
        </div>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup>
import { computed } from "vue";
import { useMessage, NModal, NCard, NButton, NIcon } from "naive-ui";

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["update:modelValue"]);

const message = useMessage();

const isVisible = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  },
});

const downloadPlugin = () => {
  const link = document.createElement("a");
  link.href = "/Photoreka.lrplugin.zip";
  link.download = "Photoreka.lrplugin.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  message.success("Downloading Lightroom Plugin...");
};
</script>

<style scoped>
/* Lightroom Modal Styles */
.lightroom-modal-content {
  color: #ffffffd1;
}

.modal-header-section {
  text-align: center;
  margin-bottom: 32px;
}

.lr-icon-large {
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}

.modal-description {
  font-size: 16px;
  color: #ffffff73;
  margin: 0;
  line-height: 1.5;
}

.screenshot-container {
  margin-bottom: 32px;
  text-align: center;
}

.plugin-screenshot {
  width: 30%;
  border-radius: 12px;
  margin-bottom: 8px;
  margin-top: 8px;
}

.screenshot-caption {
  font-size: 14px;
  color: #ffffff73;
  margin: 0;
  font-style: italic;
}

.installation-steps {
  margin-bottom: 24px;
}

.installation-steps h3 {
  font-size: 16px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0 0 16px 0;
}

.step {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.step-number {
  background: linear-gradient(
    135deg,
    var(--primary-color),
    var(--secondary-color)
  );
  color: white;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content h4 {
  font-size: 14px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0 0 4px 0;
}

.step-content p {
  font-size: 12px;
  color: #ffffff73;
  margin: 0;
  line-height: 1.5;
}

.step-content code {
  background-color: rgba(139, 92, 246, 0.15);
  color: var(--secondary-color);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "Courier New", monospace;
  font-size: 13px;
}

.step-content strong {
  color: #ffffffd1;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid #2c2c32;
}

.download-plugin-btn {
  min-width: 250px;
}

@media (max-width: 768px) {
  .lightroom-modal-content {
    padding: 0;
  }

  .step {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
