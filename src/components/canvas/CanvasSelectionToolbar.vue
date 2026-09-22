<template>
  <!-- El ancla es un punto (la esquina inf-der del marco proyectada a pantalla); la
       píldora cuelga de él hacia la izquierda y flota justo por debajo del marco. El
       submenú de cluster es una segunda fila DENTRO de la misma píldora: una sola
       superficie, sin un segundo anclaje que pueda desincronizarse. -->
  <div
    ref="root"
    class="selection-toolbar-anchor"
    :style="{ left: `${anchor.x}px`, top: `${anchor.y}px` }"
  >
    <div class="selection-pill">
      <div class="selection-row">
        <span class="selection-toolbar__count">{{ count }} photos</span>
        <span class="selection-toolbar__divider" />
        <!-- <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="selection-toolbar__btn"
              @click="emit('snap')"
            >
              <template #icon>
                <n-icon><MagnetOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Auto-align
        </n-tooltip> -->
        <n-tooltip v-if="canExpand" trigger="hover" placement="top">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="selection-toolbar__btn"
              :disabled="tooManyToExpand"
              @click="emit('expand')"
            >
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
            </n-button>
          </template>
          {{
            tooManyToExpand
              ? `Expand takes up to ${MAX_EXPAND_PHOTOS} photos`
              : "Expand from selection"
          }}
        </n-tooltip>
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="selection-toolbar__btn"
              @click="emit('group')"
            >
              <template #icon>
                <n-icon><GridOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Group into block
        </n-tooltip>
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-button
              size="small"
              :quaternary="!showCluster"
              :secondary="showCluster"
              :type="showCluster ? 'primary' : 'default'"
              class="selection-toolbar__btn selection-toolbar__btn--cluster"
              :loading="cluster.loading"
              @click="showCluster = !showCluster"
            >
              <template #icon>
                <n-icon><ShapesOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Cluster by similarity
        </n-tooltip>
        <span class="selection-toolbar__divider" />
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              circle
              class="selection-toolbar__btn"
              @click="emit('deselect')"
            >
              <template #icon>
                <n-icon><CloseOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Deselect
        </n-tooltip>
      </div>

      <Transition name="selection-submenu">
        <div v-if="showCluster" class="selection-row selection-row--submenu">
          <ClusterMenu
            v-bind="cluster"
            @cluster-by="(chunk, scoreKey) => emit('cluster-by', chunk, scoreKey)"
            @set-layout="emit('set-layout', $event)"
            @set-k="emit('set-k', $event)"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { NButton, NIcon, NTooltip } from "naive-ui";
import {
  AddOutline,
  CloseOutline,
  GridOutline,
  MagnetOutline,
  ShapesOutline,
} from "@vicons/ionicons5";
import ClusterMenu from "@/components/canvas/ClusterMenu.vue";

const props = defineProps({
  /** Esquina superior-derecha del marco, en píxeles del contenedor del stage. */
  anchor: { type: Object, required: true },
  count: { type: Number, default: 0 },
  /** Estado del clustering, con los mismos nombres que las props de ClusterMenu. */
  cluster: { type: Object, required: true },
  /** La expansión por catálogo está disponible; si no, el '+' no tiene nada que abrir. */
  canExpand: { type: Boolean, default: false },
});

/** Tope de fotos de partida que admite una expansión. */
const MAX_EXPAND_PHOTOS = 9;

const tooManyToExpand = computed(() => props.count > MAX_EXPAND_PHOTOS);

const emit = defineEmits([
  "snap",
  "group",
  "expand",
  "deselect",
  "cluster-by",
  "set-layout",
  "set-k",
]);

const root = ref(null);
const showCluster = ref(false);

// Los desplegables de los selects se teletransportan al body: un clic en una de sus
// opciones cae fuera de la píldora y no debe cerrar el submenú.
const onPointerDownOutside = (event) => {
  const target = event.target;
  if (root.value?.contains(target)) return;
  if (target.closest?.(".n-base-select-menu")) return;
  showCluster.value = false;
};

watch(showCluster, (open) => {
  if (open) document.addEventListener("mousedown", onPointerDownOutside, true);
  else document.removeEventListener("mousedown", onPointerDownOutside, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onPointerDownOutside, true);
});
</script>

<style scoped>
.selection-toolbar-anchor {
  position: absolute;
  z-index: 20;
  pointer-events: none;
}

/* Una sola superficie: crece hacia abajo al abrirse el submenú, porque el borde superior
   es el que queda clavado al marco. */
.selection-pill {
  position: absolute;
  right: 0;
  top: 8px;
  display: flex;
  flex-direction: column;
  background: var(--bg-container, rgba(30, 30, 30, 0.95));
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  white-space: nowrap;
}

.selection-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 4px 6px;
}

.selection-row--submenu {
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}

.selection-submenu-enter-active,
.selection-submenu-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.selection-submenu-enter-from,
.selection-submenu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.selection-toolbar__count {
  /* Absorbe el hueco sobrante cuando la fila del submenú es la que marca el ancho, así el
     contador queda siempre pegado al borde izquierdo y los botones al derecho. */
  margin-right: auto;
  padding: 0 6px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}

.selection-toolbar__divider {
  width: 1px;
  align-self: stretch;
  margin: 2px 2px;
  background: var(--border-color, rgba(255, 255, 255, 0.12));
}

.selection-toolbar__btn {
  color: var(--text-primary);
}

.selection-toolbar__btn--cluster {
  font-size: var(--font-size-xs);
}
</style>
