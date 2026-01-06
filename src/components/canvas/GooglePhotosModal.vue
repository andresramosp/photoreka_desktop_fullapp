<template>
  <!-- Estado de espera mientras el usuario selecciona en Google Photos -->
  <div
    v-if="isWaitingForSelection || isImporting"
    class="import-progress-overlay"
  >
    <div class="import-progress-card">
      <div class="progress-icon">
        <n-spin size="medium" />
      </div>

      <!-- Esperando selección -->
      <template v-if="isWaitingForSelection && !isImporting">
        <h3 class="progress-title">Selecting from Google Photos</h3>
        <p class="progress-text">
          A new window has opened. Select your photos there and click "Done"
          when finished.
        </p>
        <n-button
          type="default"
          size="small"
          @click="cancelSelection"
          style="margin-top: 16px"
        >
          Cancel
        </n-button>
      </template>

      <!-- Descargando fotos -->
      <template v-else-if="isImporting">
        <h3 class="progress-title">Importing from Google Photos</h3>
        <n-progress
          type="line"
          :percentage="importProgress"
          :show-indicator="false"
        />
        <p class="progress-text">
          Downloading {{ importedCount }} of {{ totalToImport }} photos...
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { NSpin, NProgress, NButton } from "naive-ui";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:show", "photos-imported"]);

// Google Photos composable
const googlePhotos = useGooglePhotos();

// Estado local
const isWaitingForSelection = ref(false);
const isImporting = ref(false);
const importedCount = ref(0);
const totalToImport = ref(0);

// Computed
const importProgress = computed(() => {
  if (totalToImport.value === 0) return 0;
  return (importedCount.value / totalToImport.value) * 100;
});

// Cuando show cambia a true, abrir el picker
watch(
  () => props.show,
  async (newValue) => {
    if (newValue) {
      await openGooglePicker();
    }
  }
);

function cancelSelection() {
  googlePhotos.cancelPicker();
  isWaitingForSelection.value = false;
  emit("update:show", false);
}

async function openGooglePicker() {
  try {
    console.log("🚀 Opening Google Photos Picker...");

    // Inicializar si es necesario
    if (!googlePhotos.isInitialized.value) {
      await googlePhotos.initialize();
    }

    isWaitingForSelection.value = true;

    // Abrir el picker (autoriza automáticamente si es necesario)
    // Esta llamada abre una nueva ventana y hace polling hasta que el usuario termine
    const selectedPhotos = await googlePhotos.selectPhotos();

    isWaitingForSelection.value = false;

    if (!selectedPhotos || selectedPhotos.length === 0) {
      console.log("❌ No photos selected");
      emit("update:show", false);
      return;
    }

    console.log(`📷 ${selectedPhotos.length} photos selected, downloading...`);

    // Iniciar descarga
    isImporting.value = true;
    importedCount.value = 0;
    totalToImport.value = selectedPhotos.length;

    // Descargar las fotos con progreso
    const downloadResults = await googlePhotos.downloadMultiplePhotos(
      selectedPhotos,
      (downloaded, total) => {
        importedCount.value = downloaded;
      },
      5 // Concurrencia de 5
    );

    // Filtrar solo las exitosas y adaptar al formato esperado por PhotosLightboxTab
    const successfulDownloads = downloadResults
      .filter((r) => r.success)
      .map((r) => ({
        mediaItem: {
          id: r.mediaItem.id,
          filename:
            r.mediaItem.mediaFile?.filename ||
            r.mediaItem.filename ||
            `photo-${r.mediaItem.id}.jpg`,
          mimeType:
            r.mediaItem.mediaFile?.mimeType ||
            r.mediaItem.mimeType ||
            "image/jpeg",
          ...r.mediaItem,
        },
        blob: r.blob,
        success: true,
      }));

    console.log(
      `✅ ${successfulDownloads.length} photos downloaded successfully`
    );

    // Emitir las fotos descargadas
    emit("photos-imported", successfulDownloads);

    // Reset state
    importedCount.value = 0;
    totalToImport.value = 0;
  } catch (error) {
    console.error("❌ Error with Google Photos Picker:", error);
  } finally {
    isImporting.value = false;
    isWaitingForSelection.value = false;
    emit("update:show", false);
  }
}

onMounted(() => {
  // Solo necesitamos Google Identity Services (GIS), no gapi
  if (
    !document.querySelector('script[src*="accounts.google.com/gsi/client"]')
  ) {
    const gsiScript = document.createElement("script");
    gsiScript.src = "https://accounts.google.com/gsi/client";
    gsiScript.async = true;
    gsiScript.defer = true;
    document.head.appendChild(gsiScript);
  }
});

onUnmounted(() => {
  // Cancelar cualquier operación pendiente
  if (isWaitingForSelection.value) {
    googlePhotos.cancelPicker();
  }
});
</script>

<style scoped>
.import-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.import-progress-card {
  background-color: #1a1a1f;
  border: 1px solid #2c2c32;
  border-radius: 16px;
  padding: 32px 48px;
  min-width: 350px;
  text-align: center;
}

.progress-icon {
  margin-bottom: 16px;
}

.progress-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0 0 24px 0;
}

.progress-text {
  text-align: center;
  font-size: 14px;
  color: #ffffff73;
  margin: 12px 0 0 0;
}
</style>
