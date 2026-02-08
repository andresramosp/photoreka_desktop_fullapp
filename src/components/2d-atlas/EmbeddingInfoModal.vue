<template>
  <n-modal
    v-model:show="isVisible"
    :style="{ width: '820px', maxWidth: '92vw' }"
  >
    <n-card
      title="Embeddings & 2D projection"
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
          <div class="hero-badge">Similarity map</div>
          <h3 class="hero-title">A map of visual and semantic proximity</h3>
          <p class="hero-subtitle">
            This view places photos that look or “mean” something similar closer
            together. The selector <strong>Clustering Type</strong> changes what
            “similar” means.
          </p>
        </div>

        <div class="callouts-image-container">
          <div class="callouts">
            <div class="callout">
              <div class="callout-title">What drives the layout</div>
              <div class="callout-body">
                Each photo is turned into an <strong>embedding</strong>: a
                compact numeric "fingerprint". Photos with similar fingerprints
                tend to end up near each other.
              </div>
            </div>
            <div class="callout">
              <div class="callout-title">How to read the map</div>
              <div class="callout-body">
                Look for neighborhoods and clusters. A cluster is usually a set
                of photos that share a theme, a palette, a scene, or a technical
                pattern (depending on the type).
              </div>
            </div>
          </div>
          <div class="image-container">
            <img
              src="/src/assets/tutorials/embeddings.png"
              alt="Visualización de embeddings"
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
          <h4 class="section-title">1) Embeddings in one minute</h4>
          <p class="section-text">
            An embedding is a list of numbers that summarizes an image. It’s
            built so that “similar images” get similar embeddings.
          </p>
          <div class="codebox">
            <div class="codebox-title">Pipeline</div>
            <pre class="codebox-pre">
photo → embedding → 2D projection → (x, y)</pre
            >
          </div>
        </div>

        <div class="section">
          <h4 class="section-title">2) What each type emphasizes</h4>
          <p class="section-text">
            Different types use different signals, so the map can change a lot:
          </p>

          <div class="cards">
            <div class="card">
              <div class="card-title">General</div>
              <div class="card-body">
                Broad visual + semantic similarity (scene, objects, overall
                style).
              </div>
            </div>
            <div class="card">
              <div class="card-title">Narrative</div>
              <div class="card-body">
                Story-like grouping: what’s happening, actions, event feel.
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
              <div class="card-body">Overall color palette / distribution.</div>
            </div>

            <div class="card">
              <div class="card-title">Technical</div>
              <div class="card-body">
                More technical visual traits (sharpness, exposure, noise), when
                available.
              </div>
            </div>
          </div>

          <div class="hint">
            Tip: click a cluster and check what the photos share (subject,
            palette, lighting, mood, or technical look).
          </div>
        </div>

        <div class="section">
          <h4 class="section-title">3) Why it’s 2D</h4>
          <p class="section-text">
            The embedding space is high-dimensional. To visualize it, we project
            it down to 2D while trying to keep neighborhoods reasonably
            consistent.
          </p>
          <ul class="bullets">
            <li>X and Y are not “meaningful features” on their own.</li>
            <li>The map can rotate/flip and still mean the same thing.</li>
            <li>Some distortion is inevitable when flattening a space.</li>
          </ul>
        </div>

        <div class="section">
          <h4 class="section-title">4) What clusters mean</h4>
          <p class="section-text">
            A cluster is a region where many photos are similar under the chosen
            type. It’s great for discovery and curation.
          </p>
          <ul class="bullets">
            <li>
              <strong>Dense clusters</strong>: many variations of a similar look
              or subject.
            </li>
            <li><strong>Bridges</strong>: images that mix two themes.</li>
            <li><strong>Outliers</strong>: unusual images (or edge cases).</li>
          </ul>
        </div>

        <div class="section">
          <h4 class="section-title">5) What is lost in 2D reduction?</h4>
          <p class="section-text">
            Reducing high-dimensional embeddings to 2D inevitably sacrifices
            some semantic and visual richness. The projection creates broader,
            more global clusters of similarity, but finer relationships between
            images can be lost. This means that photos grouped together here may
            not match the nuanced similarities found in the Canvas tool, where
            the full embedding vector is used to search for richer connections.
            Here, we visualize global groupings, while Canvas operates with the
            complete vector to reveal more detailed and precise relationships.
          </p>
        </div>

        <div class="section">
          <h4 class="section-title">How to play with this?</h4>
          <p class="section-text">
            Don’t just zoom in on local clusters—try zooming out and exploring
            the whole map. Switch between clustering types to see how groups
            appear and disappear. Combine with search filters, the time range
            slider, and aesthetic score filters to reveal new patterns and get a
            global sense of your catalog. The more you experiment, the more
            intuition you’ll build about your photo collection!
            <br /><br />
            <strong>Remember:</strong> the best insights come from comparing
            nearby photos and switching types.
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
