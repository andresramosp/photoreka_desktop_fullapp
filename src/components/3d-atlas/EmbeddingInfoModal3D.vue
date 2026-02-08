<template>
  <n-modal
    v-model:show="isVisible"
    :style="{ width: '820px', maxWidth: '92vw' }"
  >
    <n-card
      title="Embeddings & 3D space"
      :bordered="false"
      size="huge"
      role="dialog"
      aria-modal="true"
      style="
        background-color: var(--bg-body);
        border: 1px solid #2c2c32;
        height: 72vh;
        overflow: hidden;
      "
    >
      <template #header-extra>
        <n-button text @click="isVisible = false" aria-label="Close">
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

      <div class="embedding-modal-content">
        <div class="hero">
          <div class="hero-badge">Similarity space</div>
          <h3 class="hero-title">Explore your photos as a 3D landscape</h3>
          <p class="hero-subtitle">
            This view places photos in a
            <strong>three-dimensional space</strong>
            where distance reflects visual or semantic similarity. The selector
            <strong>Clustering Type</strong> changes what “similar” means — and
            reshapes the entire space.
          </p>
        </div>

        <div class="callouts-image-container">
          <div class="callouts">
            <div class="callout">
              <div class="callout-title">What drives the space</div>
              <div class="callout-body">
                Each photo is converted into an <strong>embedding</strong>: a
                compact numeric fingerprint. Photos with similar fingerprints
                tend to occupy nearby regions in 3D space.
              </div>
            </div>
            <div class="callout">
              <div class="callout-title">How to read a 3D map</div>
              <div class="callout-body">
                Think in volumes rather than flat clusters. Groups can overlap,
                stretch, stack, or form layers, revealing relationships that are
                hard to see in 2D.
              </div>
            </div>
          </div>
          <div class="image-container">
            <img
              src="/src/assets/tutorials/embeddings.png"
              alt="3D embeddings visualization"
              style="
                max-width: 100%;
                max-height: 320px;
                border-radius: 16px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.13);
                object-fit: contain;
                background: #18181c;
                border: 1px solid #23232a;
              "
            />
          </div>
        </div>

        <n-divider />

        <div class="section">
          <h4 class="section-title">1) What each type emphasizes</h4>
          <p class="section-text">
            Each clustering type highlights different signals, reshaping the 3D
            space and changing how volumes, layers, and transitions appear:
          </p>

          <div class="cards">
            <div class="card">
              <div class="card-title">General</div>
              <div class="card-body">
                Broad visual and semantic similarity: scenes, objects, and
                overall visual style.
              </div>
            </div>
            <div class="card">
              <div class="card-title">Narrative</div>
              <div class="card-body">
                Grouping by actions, events, and story-like progression.
              </div>
            </div>
            <div class="card">
              <div class="card-title">Cultural context</div>
              <div class="card-body">
                Places, symbols, environments, and contextual cues.
              </div>
            </div>
            <div class="card">
              <div class="card-title">Visual accents</div>
              <div class="card-body">
                Distinctive details, patterns, and standout elements.
              </div>
            </div>
            <div class="card">
              <div class="card-title">Chromatic</div>
              <div class="card-body">
                Overall color palette and color distribution.
              </div>
            </div>
            <div class="card">
              <div class="card-title">Technical</div>
              <div class="card-body">
                Technical traits such as sharpness, exposure, or noise (when
                available).
              </div>
            </div>
          </div>

          <div class="hint">
            Tip: rotate the space and move through it — clusters that overlap in
            2D often separate into distinct layers in 3D.
          </div>
        </div>

        <div class="section">
          <h4 class="section-title">2) Why 3D?</h4>
          <p class="section-text">
            The embedding space is inherently high-dimensional. Projecting it to
            3D preserves more structure than flattening it to 2D, making certain
            relationships easier to see.
          </p>
          <ul class="bullets">
            <li>X, Y, and Z are not meaningful on their own.</li>
            <li>
              The space can rotate, flip, or mirror without changing meaning.
            </li>
            <li>Distortion still exists, but 3D reduces forced overlaps.</li>
          </ul>
        </div>

        <div class="section">
          <h4 class="section-title">3) What clusters mean in 3D</h4>
          <p class="section-text">
            A cluster is a dense region in space where many photos share similar
            characteristics under the selected type.
          </p>
          <ul class="bullets">
            <li>
              <strong>Dense volumes</strong>: many variations of a similar look
              or subject.
            </li>
            <li>
              <strong>Bridges and gradients</strong>: smooth transitions between
              themes.
            </li>
            <li>
              <strong>Outliers</strong>: isolated or unusual images at the edges
              of the space.
            </li>
          </ul>
        </div>

        <div class="section">
          <h4 class="section-title">4) What is lost in 3D reduction?</h4>
          <p class="section-text">
            Even when projecting to 3D, some semantic and visual richness is
            inevitably lost compared to the original high-dimensional embedding
            space. The 3D view forms broader, more global clusters, but subtle
            relationships between images may disappear. As a result, photos
            grouped together here might not match the nuanced similarities found
            in the Canvas tool, which uses the full embedding vector to search
            for richer connections.
          </p>
        </div>

        <div class="section">
          <h4 class="section-title">5) How to explore the space?</h4>
          <p class="section-text">
            Don’t stay fixed on a single angle. Rotate the space, zoom in and
            out, and move through dense regions and empty gaps. Switch
            clustering types to see how the geometry reshapes itself. Combine
            this with filters, time ranges, and aesthetic scores to uncover
            hidden structures and narratives in your catalog.
            <br /><br />
            <strong>Remember:</strong> insight often comes from motion — moving
            through the space and comparing nearby photos from multiple angles.
          </p>
        </div>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup>
import { computed } from "vue";
import { NModal, NCard, NButton, NIcon, NDivider } from "naive-ui";

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["update:modelValue"]);

const isVisible = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  },
});
</script>

<style scoped>
.embedding-modal-content {
  color: var(--text-secondary);
  height: calc(72vh - 92px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
}

.hero {
  border-radius: 14px;
  padding: 18px 18px;
  background:
    radial-gradient(
      900px 320px at 30% 0%,
      color-mix(in srgb, var(--primary-color) 18%, transparent),
      transparent 60%
    ),
    radial-gradient(
      900px 320px at 90% 0%,
      color-mix(in srgb, var(--accent-color) 18%, transparent),
      transparent 60%
    ),
    rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 14px;
}

.hero-badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 10px;
}

.hero-title {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.hero-subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.callouts-image-container {
  display: flex;
  gap: 16px;
  margin-bottom: 22px;
  align-items: flex-start;
}

.callouts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 1 45%;
}

.image-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

@media (max-width: 720px) {
  .callouts-image-container {
    flex-direction: column;
  }

  .callouts {
    flex: 1;
  }

  .image-container {
    width: 100%;
  }
}

.callout {
  border-radius: 12px;
  padding: 12px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.callout-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.callout-body {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.section {
  margin: 14px 0;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-text {
  margin: 0 0 10px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

@media (max-width: 720px) {
  .cards {
    grid-template-columns: 1fr;
  }
}

.card {
  border-radius: 12px;
  padding: 12px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.card-body {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.codebox {
  margin-top: 10px;
  border-radius: 12px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.25);
  overflow: hidden;
}

.codebox-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.codebox-pre {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  font-family: "Courier New", monospace;
  white-space: pre-wrap;
}

.bullets {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.hint {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.22);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.footer {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.footer-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.footer-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
}
</style>
