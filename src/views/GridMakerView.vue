<template>
  <div class="grid-maker-container view-container">
    <!-- Header -->
    <div v-if="!gridCreated" class="grid-maker-header">
      <h1 class="page-title">Grid Maker</h1>
      <p class="page-subtitle">
        Create custom photo grids with automatic spacing and intelligent filling
      </p>
    </div>

    <!-- Grid Size Selector -->
    <div v-if="!gridCreated" class="grid-selector-section">
      <h2 class="section-title">Choose Grid Size</h2>
      <div class="grid-selector">
        <div class="selector-info">
          <span class="selector-label"
            >{{ hoveredRows || 1 }} × {{ hoveredCols || 1 }}</span
          >
          <span class="selector-description">
            {{ (hoveredRows || 1) * (hoveredCols || 1) }} photos
          </span>
        </div>

        <!-- Interactive Grid Selector -->
        <div class="grid-preview" @mouseleave="resetHover">
          <div v-for="row in maxRows" :key="'row-' + row" class="grid-row">
            <div
              v-for="col in maxCols"
              :key="'cell-' + row + '-' + col"
              class="grid-cell"
              :class="{
                active: row <= hoveredRows && col <= hoveredCols,
                selected: row <= selectedRows && col <= selectedCols,
              }"
              @mouseenter="updateHover(row, col)"
              @click="selectGrid(row, col)"
            ></div>
          </div>
        </div>

        <div class="grid-actions">
          <n-button
            type="primary"
            :disabled="!selectedRows || !selectedCols"
            @click="createGrid"
          >
            Create {{ selectedRows }}×{{ selectedCols }} Grid
          </n-button>
        </div>
      </div>
    </div>

    <!-- Grid Management -->
    <div v-if="gridCreated" class="grid-management-section">
      <!-- Controls -->
      <div class="grid-controls">
        <div class="control-group">
          <n-button @click="resetGrid" secondary>
            <template #icon>
              <n-icon><RefreshOutline /></n-icon>
            </template>
            New Grid
          </n-button>

          <div class="grid-info">
            <span class="grid-size"
              >{{ selectedRows }}×{{ selectedCols }} Grid</span
            >
            <span class="photos-count">
              {{ filledCells }} / {{ totalCells }} photos
            </span>
            <span v-if="generatedPhotosCount > 0" class="generated-count">
              {{ generatedPhotosCount }} AI generated
            </span>
            <span v-if="excludedPhotosCount > 0" class="excluded-count">
              {{ excludedPhotosCount }} excluded
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <n-button
                    text
                    size="tiny"
                    @click="clearExcludedPhotos"
                    style="margin-left: 4px; padding: 0; min-height: auto"
                  >
                    <n-icon size="12">
                      <CloseOutline />
                    </n-icon>
                  </n-button>
                </template>
                Clear excluded photos list
              </n-tooltip>
            </span>
          </div>
        </div>

        <div class="control-group">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-select
                v-model:value="fillType"
                :options="fillTypeOptions"
                placeholder="Fill type"
                style="width: 180px"
              />
            </template>
            <span v-if="fillType === 'embedding'">
              <strong>General:</strong> Finds photos with similar semantic
              content and composition
            </span>
            <span v-else-if="fillType === 'chromatic'">
              <strong>Chromatic:</strong> Finds photos with similar colors and
              visual style
            </span>
          </n-tooltip>

          <!-- <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-select
                v-model:value="processingMode"
                :options="[
                  { label: 'Sequential (Safe)', value: 'sequential' },
                  { label: 'Concurrent (Fast)', value: 'concurrent' },
                ]"
                placeholder="Processing mode"
                style="width: 160px"
              />
            </template>
            <span v-if="processingMode === 'sequential'">
              <strong>Sequential:</strong> Slower but guarantees no duplicate
              photos
            </span>
            <span v-else>
              <strong>Concurrent:</strong> Faster but may generate some
              duplicate photos
            </span>
          </n-tooltip> -->

          <n-button
            type="primary"
            :disabled="!hasEmptyCells"
            :loading="isGenerating"
            @click="fillGaps"
          >
            <template #icon>
              <n-icon><BulbOutline /></n-icon>
            </template>
            Fill Gaps
          </n-button>
        </div>
      </div>

      <!-- Photo Grid -->
      <div class="photo-grid-container">
        <div class="photo-grid" :style="gridStyle">
          <div
            v-for="(cell, index) in gridCells"
            :key="'grid-cell-' + index"
            :data-cell-index="index"
            class="photo-cell"
            :class="{
              'has-photo': cell.photo,
              'is-generating': cell.isGenerating,
            }"
          >
            <!-- Empty Cell with Add Button -->
            <template v-if="!cell.photo">
              <div
                v-if="!cell.isGenerating && !isGenerating"
                class="empty-cell"
              >
                <n-button
                  circle
                  size="large"
                  class="add-photo-btn"
                  @click="openPhotoSelector(index)"
                >
                  <template #icon>
                    <n-icon size="24">
                      <AddOutline />
                    </n-icon>
                  </template>
                </n-button>
                <span class="cell-label">Add Photo</span>
              </div>
              <!-- Generating Skeleton -->
              <div v-else-if="cell.isGenerating" class="generating-cell">
                <n-skeleton height="100%" width="100%" />
                <div v-if="showSpinnerOverlay" class="generating-overlay">
                  <n-spin size="medium" />
                </div>
              </div>
            </template>
            <!-- Photo Cell -->
            <div v-else class="filled-cell">
              <img
                :src="cell.photo.thumbnailUrl"
                :alt="cell.photo.name || cell.photo.title"
                class="cell-photo"
              />
              <div class="cell-overlay">
                <n-button
                  circle
                  size="small"
                  class="remove-photo-btn"
                  @click="removePhoto(index)"
                >
                  <template #icon>
                    <n-icon><CloseOutline /></n-icon>
                  </template>
                </n-button>
              </div>

              <!-- Movement Controls -->
              <div class="movement-controls">
                <!-- Up Arrow -->
                <n-button
                  v-if="canMoveUp(index)"
                  circle
                  size="small"
                  class="move-btn move-up"
                  @click="movePhoto(index, 'up')"
                >
                  <template #icon>
                    <n-icon size="16"><ChevronUpOutline /></n-icon>
                  </template>
                </n-button>

                <!-- Down Arrow -->
                <n-button
                  v-if="canMoveDown(index)"
                  circle
                  size="small"
                  class="move-btn move-down"
                  @click="movePhoto(index, 'down')"
                >
                  <template #icon>
                    <n-icon size="16"><ChevronDownOutline /></n-icon>
                  </template>
                </n-button>

                <!-- Left Arrow -->
                <n-button
                  v-if="canMoveLeft(index)"
                  circle
                  size="small"
                  class="move-btn move-left"
                  @click="movePhoto(index, 'left')"
                >
                  <template #icon>
                    <n-icon size="16"><ChevronBackOutline /></n-icon>
                  </template>
                </n-button>

                <!-- Right Arrow -->
                <n-button
                  v-if="canMoveRight(index)"
                  circle
                  size="small"
                  class="move-btn move-right"
                  @click="movePhoto(index, 'right')"
                >
                  <template #icon>
                    <n-icon size="16"><ChevronForwardOutline /></n-icon>
                  </template>
                </n-button>
              </div>
              <!-- Photo info badge -->
              <!-- <div v-if="cell.photo.sourcePhotoId" class="photo-info-badge">
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <span class="generation-info">
                      {{ cell.photo.generationDepth || 0 }}
                      <span class="criteria-indicator">{{
                        cell.photo.criteria === "chromatic" ? "🎨" : "🧠"
                      }}</span>
                    </span>
                  </template>
                  <span>
                    Generation depth: {{ cell.photo.generationDepth || 0
                    }}<br />
                    Criteria:
                    {{
                      cell.photo.criteria === "chromatic"
                        ? "Chromatic (color-based)"
                        : "Embedding (semantic)"
                    }}
                  </span>
                </n-tooltip>
              </div> -->
              <!-- Original photo indicator -->
              <div
                v-if="!cell.photo.sourcePhotoId && !cell.photo.sourcePhotoIds"
                class="original-photo-badge"
              >
                <n-icon size="12"><BookmarkOutline /></n-icon>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid Actions -->
      <div class="grid-actions-bottom">
        <n-button @click="exportGrid" type="primary">
          <template #icon>
            <n-icon><DownloadOutline /></n-icon>
          </template>
          Export Grid
        </n-button>

        <n-button @click="saveTemplate">
          <template #icon>
            <n-icon><BookmarkOutline /></n-icon>
          </template>
          Save as Template
        </n-button>
      </div>
    </div>

    <!-- Photo Selection Dialog -->
    <PhotosDialog
      v-model="showPhotoDialog"
      :is-trash="false"
      :single-selection="true"
      title="Select Photo for Grid"
      @add-photos="handlePhotoSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useMessage, NSelect, NButton, NTooltip } from "naive-ui";
import PhotosDialog from "@/components/PhotosDialog.vue";
import { usePhotosStore } from "@/stores/photos";
import { api } from "@/utils/axios";

// Import icons
import {
  RefreshOutline,
  BulbOutline,
  AddOutline,
  CloseOutline,
  DownloadOutline,
  BookmarkOutline,
  ChevronUpOutline,
  ChevronDownOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";

defineOptions({
  name: "GridMakerView",
});

// Grid configuration
const maxRows = 8;
const maxCols = 8;

// Maximum number of passes for iterative gap filling
const MAX_FILL_PASSES = 20;

// State
const message = useMessage();
const photosStore = usePhotosStore();
const gridCreated = ref(false);
const selectedRows = ref(0);
const selectedCols = ref(0);
const hoveredRows = ref(0);
const hoveredCols = ref(0);
const showPhotoDialog = ref(false);
const selectedCellIndex = ref<number | null>(null);
const isGenerating = ref(false);
const fillType = ref<string>("embedding");

// Configuration for processing mode
const processingMode = ref<"sequential" | "concurrent">("sequential");

// Developer option: Show spinner overlay on generating cells (for debugging/preference)
const showSpinnerOverlay = ref(true); // Set to true to enable spinner overlay

// Track deleted photos to prevent regeneration
const deletedPhotoIds = ref<string[]>([]);

// Window size tracking for responsive grid
const windowWidth = ref(window.innerWidth);

// Fill type options
const fillTypeOptions = [
  { label: "General", value: "embedding" },
  { label: "Context", value: "context" },
  { label: "Narrative", value: "story" },
  { label: "Chromatic", value: "chromatic" },
];

// Grid cells data
const gridCells = ref<
  Array<{
    photo: any | null;
    isGenerating: boolean;
  }>
>([]);

// Computed properties
const totalCells = computed(() => selectedRows.value * selectedCols.value);

const filledCells = computed(
  () => gridCells.value.filter((cell) => cell.photo !== null).length
);

const generatedPhotosCount = computed(
  () =>
    gridCells.value.filter((cell) => cell.photo && cell.photo.sourcePhotoId)
      .length
);

const excludedPhotosCount = computed(() => deletedPhotoIds.value.length);

const hasEmptyCells = computed(() =>
  gridCells.value.some((cell) => !cell.photo && !cell.isGenerating)
);

const gridStyle = computed(() => {
  const minCellSize = 120;
  const maxCellSize = minCellSize + 150;

  // Calcular el ancho disponible del contenedor (asumiendo padding de 32px a cada lado)
  const containerPadding = 64; // 32px * 2
  const gridGap = 16; // var(--spacing-md) típicamente es 16px
  const availableWidth = windowWidth.value - containerPadding;
  const totalGapWidth = (selectedCols.value - 1) * gridGap;
  const availableForCells = availableWidth - totalGapWidth;

  // Calcular el tamaño óptimo de celda
  const optimalCellSize = Math.floor(availableForCells / selectedCols.value);
  const cellSize = Math.min(
    Math.max(optimalCellSize, minCellSize),
    maxCellSize
  );

  return {
    gridTemplateColumns: `repeat(${selectedCols.value}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${selectedRows.value}, ${cellSize}px)`,
  };
});

// Methods
const updateHover = (row: number, col: number) => {
  hoveredRows.value = row;
  hoveredCols.value = col;
};

const resetHover = () => {
  hoveredRows.value = 0;
  hoveredCols.value = 0;
};

const selectGrid = (rows: number, cols: number) => {
  selectedRows.value = rows;
  selectedCols.value = cols;
};

const createGrid = () => {
  gridCreated.value = true;

  // Initialize grid cells
  gridCells.value = Array(totalCells.value)
    .fill(null)
    .map(() => ({
      photo: null,
      isGenerating: false,
    }));

  // Reset deleted photos when creating new grid
  deletedPhotoIds.value = [];
};

const resetGrid = () => {
  gridCreated.value = false;
  selectedRows.value = 0;
  selectedCols.value = 0;
  hoveredRows.value = 0;
  hoveredCols.value = 0;
  gridCells.value = [];
  deletedPhotoIds.value = []; // Reset deleted photos when creating new grid
  message.info("Grid reset");
};

const openPhotoSelector = (cellIndex: number) => {
  selectedCellIndex.value = cellIndex;
  showPhotoDialog.value = true;
};

const handlePhotoSelection = (photoIds: string[]) => {
  if (photoIds.length > 0 && selectedCellIndex.value !== null) {
    // Get the actual photo from the photos store
    const photoId = photoIds[0];
    const photo = photosStore.photos.find((p: any) => p.id == photoId); // Use == to handle string/number comparison

    if (photo) {
      gridCells.value[selectedCellIndex.value].photo = photo;
    } else {
      message.error("Selected photo not found");
    }
  }

  showPhotoDialog.value = false;
  selectedCellIndex.value = null;
};

const removePhoto = (cellIndex: number) => {
  const photo = gridCells.value[cellIndex].photo;

  if (photo) {
    // Add to deleted photos list to prevent regeneration
    if (!deletedPhotoIds.value.includes(photo.id)) {
      deletedPhotoIds.value.push(photo.id);
    }

    gridCells.value[cellIndex].photo = null;
    message.info("Photo removed from grid and marked as excluded");
  }
};

const clearExcludedPhotos = () => {
  deletedPhotoIds.value = [];
  message.success(
    "Excluded photos list cleared. These photos can now be generated again."
  );
};

// Movement functions
const canMoveUp = (cellIndex: number): boolean => {
  const row = Math.floor(cellIndex / selectedCols.value);
  return row > 0;
};

const canMoveDown = (cellIndex: number): boolean => {
  const row = Math.floor(cellIndex / selectedCols.value);
  return row < selectedRows.value - 1;
};

const canMoveLeft = (cellIndex: number): boolean => {
  const col = cellIndex % selectedCols.value;
  return col > 0;
};

const canMoveRight = (cellIndex: number): boolean => {
  const col = cellIndex % selectedCols.value;
  return col < selectedCols.value - 1;
};

const movePhoto = async (
  fromIndex: number,
  direction: "up" | "down" | "left" | "right"
) => {
  const row = Math.floor(fromIndex / selectedCols.value);
  const col = fromIndex % selectedCols.value;

  let toIndex: number;

  switch (direction) {
    case "up":
      toIndex = (row - 1) * selectedCols.value + col;
      break;
    case "down":
      toIndex = (row + 1) * selectedCols.value + col;
      break;
    case "left":
      toIndex = row * selectedCols.value + (col - 1);
      break;
    case "right":
      toIndex = row * selectedCols.value + (col + 1);
      break;
    default:
      return;
  }

  // Verificar que el índice de destino es válido
  if (toIndex < 0 || toIndex >= gridCells.value.length) {
    return;
  }

  // Simple swap without animation
  const fromPhotoData = gridCells.value[fromIndex].photo;
  const toPhotoData = gridCells.value[toIndex].photo;

  gridCells.value[fromIndex].photo = toPhotoData;
  gridCells.value[toIndex].photo = fromPhotoData;
};

// Nueva función: obtiene una foto relacionada usando varios vecinos como anchorIds
const getPhotoFromNeighbors = async (
  anchorIds: string[],
  criteria: string = "embedding",
  providedCurrentPhotosIds?: string[]
): Promise<any> => {
  try {
    const gridPhotosIds = gridCells.value
      .filter((cell) => cell.photo !== null)
      .map((cell) => cell.photo.id);
    const currentPhotosIds = providedCurrentPhotosIds || [
      ...gridPhotosIds,
      ...deletedPhotoIds.value,
    ];
    const response = await api.post(`/api/search/byPhotos`, {
      anchorIds,
      currentPhotosIds,
      criteria,
      opposite: false,
      inverted: false,
      resultLength: 1,
    });
    const backendPhotos = Array.isArray(response.data)
      ? response.data
      : [response.data];
    if (backendPhotos.length === 0) {
      throw new Error("No related photos found");
    }
    const relatedPhoto = backendPhotos[0];
    // Calcular la mayor profundidad de los vecinos
    let maxDepth = 0;
    for (const id of anchorIds) {
      const cell = gridCells.value.find((c) => c.photo && c.photo.id === id);
      if (cell && cell.photo && cell.photo.generationDepth)
        maxDepth = Math.max(maxDepth, cell.photo.generationDepth);
    }
    return {
      ...relatedPhoto,
      sourcePhotoIds: anchorIds,
      generationDepth: maxDepth + 1,
      criteria,
    };
  } catch (error) {
    console.error("Error getting related photo:", error);
    // Fallback a mock photo si falla la API
    const relatedPhotoId = `fallback-${anchorIds.join(
      "-"
    )}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      id: relatedPhotoId,
      url: `https://picsum.photos/400/400?random=${Date.now()}-${Math.random()}`,
      thumbnailUrl: `https://picsum.photos/200/200?random=${Date.now()}-${Math.random()}`,
      title: `Fallback for neighbors ${anchorIds.join(", ")}`,
      name: `Fallback for neighbors ${anchorIds.join(", ")}`,
      sourcePhotoIds: anchorIds,
      generationDepth: 1,
      criteria,
    };
  }
};

// Get adjacent cell indices for a given cell
const getAdjacentCells = (cellIndex: number): number[] => {
  const row = Math.floor(cellIndex / selectedCols.value);
  const col = cellIndex % selectedCols.value;
  const adjacent: number[] = [];

  // Top
  if (row > 0) adjacent.push((row - 1) * selectedCols.value + col);
  // Bottom
  if (row < selectedRows.value - 1)
    adjacent.push((row + 1) * selectedCols.value + col);
  // Left
  if (col > 0) adjacent.push(row * selectedCols.value + (col - 1));
  // Right
  if (col < selectedCols.value - 1)
    adjacent.push(row * selectedCols.value + (col + 1));

  return adjacent;
};

const fillGaps = async () => {
  isGenerating.value = true;

  // Find cells with photos (seeds for generation)
  const photoCells = gridCells.value
    .map((cell, index) => (cell.photo ? { index, photo: cell.photo } : null))
    .filter((item) => item !== null);

  if (photoCells.length === 0) {
    message.warning("Add at least one photo to start filling gaps");
    isGenerating.value = false;
    return;
  }

  if (processingMode.value === "sequential") {
    await fillGapsSequential(photoCells);
  } else {
    await fillGapsConcurrent(photoCells);
  }

  isGenerating.value = false;
};

// Sequential processing - guarantees no duplicates
const fillGapsSequential = async (photoCells: any[]) => {
  let processedCount = 0;
  let passNumber = 0;
  const maxPasses = 20; // Límite de seguridad para evitar bucles infinitos

  // Función auxiliar para obtener celdas vacías adyacentes a fotos
  const getEmptyCellsAdjacentToPhotos = (): number[] => {
    const emptyCells = new Set<number>();

    // Recorrer todas las celdas que tienen foto
    gridCells.value.forEach((cell, index) => {
      if (cell.photo && !cell.isGenerating) {
        // Encontrar celdas vacías adyacentes
        const adjacentEmpty = getAdjacentCells(index).filter(
          (adjIndex) =>
            !gridCells.value[adjIndex].photo &&
            !gridCells.value[adjIndex].isGenerating
        );
        adjacentEmpty.forEach((adjIndex) => emptyCells.add(adjIndex));
      }
    });

    return Array.from(emptyCells);
  };

  // Procesar celdas en pasadas iterativas
  while (passNumber < maxPasses) {
    passNumber++;

    // Encontrar celdas vacías que están adyacentes a fotos existentes
    const emptyCellsToFill = getEmptyCellsAdjacentToPhotos();

    if (emptyCellsToFill.length === 0) {
      // No hay más celdas para llenar
      break;
    }

    console.log(
      `Pass ${passNumber}: Processing ${emptyCellsToFill.length} cells`
    );

    // Marcar celdas como "generando"
    emptyCellsToFill.forEach((cellIndex) => {
      gridCells.value[cellIndex].isGenerating = true;
    });

    // Procesar cada celda vacía en esta pasada
    for (const cellIndex of emptyCellsToFill) {
      try {
        // Obtener IDs de vecinos con foto
        const neighborIds = getAdjacentCells(cellIndex)
          .filter((i) => gridCells.value[i].photo)
          .map((i) => gridCells.value[i].photo.id);

        if (neighborIds.length === 0) {
          gridCells.value[cellIndex].isGenerating = false;
          continue;
        }

        // Evitar duplicados
        const gridPhotosIds = gridCells.value
          .filter((cell) => cell.photo !== null)
          .map((cell) => cell.photo.id);
        const currentPhotosIds = [...gridPhotosIds, ...deletedPhotoIds.value];

        // Generar foto relacionada
        const relatedPhoto = await getPhotoFromNeighbors(
          neighborIds,
          fillType.value,
          currentPhotosIds
        );

        // Asignar profundidad basada en el número de pasada
        relatedPhoto.generationDepth = passNumber;

        // Verificar que la celda sigue vacía y asignar la foto
        if (!gridCells.value[cellIndex].photo) {
          gridCells.value[cellIndex].photo = relatedPhoto;
          processedCount++;
        }

        gridCells.value[cellIndex].isGenerating = false;
      } catch (error) {
        console.error(
          `Error generating photo for cell ${cellIndex} in pass ${passNumber}:`,
          error
        );
        gridCells.value[cellIndex].isGenerating = false;
      }
    }

    // Pequeña pausa entre pasadas para permitir que la UI se actualice
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (passNumber >= maxPasses) {
    console.warn(
      "Reached maximum number of passes, some cells may remain empty"
    );
  }
};

// Concurrent processing with validation (original implementation)
const fillGapsConcurrent = async (photoCells: any[]) => {
  let processedCount = 0;
  let passNumber = 0;
  const maxPasses = 20; // Límite de seguridad para evitar bucles infinitos
  const concurrentLimit = 3; // Número máximo de celdas a procesar concurrentemente

  // Función auxiliar para obtener celdas vacías adyacentes a fotos
  const getEmptyCellsAdjacentToPhotos = (): number[] => {
    const emptyCells = new Set<number>();

    // Recorrer todas las celdas que tienen foto
    gridCells.value.forEach((cell, index) => {
      if (cell.photo && !cell.isGenerating) {
        // Encontrar celdas vacías adyacentes
        const adjacentEmpty = getAdjacentCells(index).filter(
          (adjIndex) =>
            !gridCells.value[adjIndex].photo &&
            !gridCells.value[adjIndex].isGenerating
        );
        adjacentEmpty.forEach((adjIndex) => emptyCells.add(adjIndex));
      }
    });

    return Array.from(emptyCells);
  };

  // Función para procesar una celda
  const processCell = async (
    cellIndex: number,
    depth: number
  ): Promise<boolean> => {
    try {
      // Obtener los IDs de todas las vecinas con foto
      const neighborIds = getAdjacentCells(cellIndex)
        .filter((i) => gridCells.value[i].photo)
        .map((i) => gridCells.value[i].photo.id);

      if (neighborIds.length === 0) {
        gridCells.value[cellIndex].isGenerating = false;
        return false;
      }

      // Get current photos to avoid duplicates (including deleted photos)
      const gridPhotosIds = gridCells.value
        .filter((cell) => cell.photo !== null)
        .map((cell) => cell.photo.id);

      const currentPhotosIds = [...gridPhotosIds, ...deletedPhotoIds.value];

      // Usar getPhotoFromNeighbors en vez de getPhotoFromPhoto
      const relatedPhoto = await getPhotoFromNeighbors(
        neighborIds,
        fillType.value,
        currentPhotosIds
      );
      relatedPhoto.generationDepth = depth;

      // Validation: check if photo already exists in grid
      const isDuplicate = gridCells.value.some(
        (cell) => cell.photo && cell.photo.id === relatedPhoto.id
      );

      if (isDuplicate) {
        console.warn(
          `Duplicate photo detected: ${relatedPhoto.id}, skipping...`
        );
        gridCells.value[cellIndex].isGenerating = false;
        return false;
      }

      // Check if cell is still empty
      if (!gridCells.value[cellIndex].photo) {
        gridCells.value[cellIndex].photo = relatedPhoto;
        gridCells.value[cellIndex].isGenerating = false;
        return true;
      } else {
        gridCells.value[cellIndex].isGenerating = false;
        return false;
      }
    } catch (error) {
      console.error(`Error generating photo for cell ${cellIndex}:`, error);
      gridCells.value[cellIndex].isGenerating = false;
      return false;
    }
  };

  // Procesar celdas en pasadas iterativas con concurrencia controlada
  while (passNumber < maxPasses) {
    passNumber++;

    // Encontrar celdas vacías que están adyacentes a fotos existentes
    const emptyCellsToFill = getEmptyCellsAdjacentToPhotos();

    if (emptyCellsToFill.length === 0) {
      // No hay más celdas para llenar
      break;
    }

    console.log(
      `Pass ${passNumber}: Processing ${emptyCellsToFill.length} cells concurrently`
    );

    // Marcar celdas como "generando"
    emptyCellsToFill.forEach((cellIndex) => {
      gridCells.value[cellIndex].isGenerating = true;
    });

    // Procesar celdas en lotes con concurrencia controlada
    for (let i = 0; i < emptyCellsToFill.length; i += concurrentLimit) {
      const batch = emptyCellsToFill.slice(i, i + concurrentLimit);

      const promises = batch.map((cellIndex) =>
        processCell(cellIndex, passNumber)
      );

      const results = await Promise.all(promises);
      processedCount += results.filter((success) => success).length;
    }

    // Pequeña pausa entre pasadas para permitir que la UI se actualice
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (passNumber >= maxPasses) {
    console.warn(
      "Reached maximum number of passes, some cells may remain empty"
    );
  }
};

const exportGrid = () => {
  if (filledCells.value === 0) {
    message.warning("Add some photos to the grid before exporting");
    return;
  }

  // Simulate export process
  message.loading("Preparing grid for export...", {
    duration: 2000,
    onAfterLeave: () => {
      message.success("Grid exported successfully!");
    },
  });
};

const saveTemplate = () => {
  if (filledCells.value === 0) {
    message.warning("Add some photos to create a template");
    return;
  }

  // Simulate save process
  message.loading("Saving grid template...", {
    duration: 1500,
    onAfterLeave: () => {
      message.success("Template saved to your library!");
    },
  });
};

// Initialize photos store when component mounts
onMounted(async () => {
  await photosStore.getOrFetch();

  // Add window resize listener
  const handleResize = () => {
    windowWidth.value = window.innerWidth;
  };
  window.addEventListener("resize", handleResize);

  // Cleanup function will be called in onUnmounted
  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
  });
});
</script>

<style scoped>
.grid-maker-container {
  padding: var(--spacing-2xl);

  margin: 0 auto;
}

.grid-maker-header {
  text-align: center;
  margin-bottom: var(--spacing-3xl);
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.page-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

/* Grid Selector */
.grid-selector-section {
  margin-bottom: var(--spacing-3xl);
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xl) 0;
  text-align: center;
}

.grid-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xl);
}

.selector-info {
  text-align: center;
}

.selector-label {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
}

.selector-description {
  font-size: 14px;
  color: var(--text-secondary);
}

.grid-preview {
  display: grid;
  grid-template-rows: repeat(8, 32px);
  gap: 4px;
  padding: var(--spacing-lg);
  background-color: var(--bg-surface);
  border-radius: var(--border-radius-lg);
  border: 2px solid var(--border-color);
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(8, 32px);
  gap: 2px;
}

.grid-cell {
  width: 32px;
  height: 32px;
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.grid-cell:hover,
.grid-cell.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.grid-cell.selected {
  background-color: var(--primary-color-pressed);
  border-color: var(--primary-color-pressed);
}

.grid-actions {
  display: flex;
  justify-content: center;
}

/* Grid Management */
.grid-management-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
}

.grid-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background-color: var(--bg-surface);
  border-radius: var(--border-radius-lg);
}

.control-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.grid-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grid-size {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.photos-count {
  font-size: 14px;
  color: var(--text-secondary);
}

.generated-count {
  font-size: 12px;
  color: var(--primary-color);
  font-weight: 500;
}

.excluded-count {
  font-size: 12px;
  color: var(--error-color, #ff6b6b);
  font-weight: 500;
}

/* Photo Grid */
.photo-grid-container {
  background-color: var(--bg-surface);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-2xl);
  overflow-x: auto;
  overflow-y: visible;
}

.photo-grid {
  display: grid;
  gap: var(--spacing-md);
  margin: 0 auto;
  /* El ancho será determinado por el número de columnas */
  width: fit-content;
  justify-content: center;
  min-width: 100%;
}

.photo-cell {
  aspect-ratio: 1;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  position: relative;
  background-color: var(--bg-container);
  border: 2px solid var(--border-color);
  transition: all 0.3s ease;
}

.photo-cell:hover {
  /* border-color: var(--primary-color); */
}

/* Empty Cell */
.empty-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-sm);
  color: var(--text-secondary);
}

.add-photo-btn {
  background-color: var(--bg-container) !important;
  border: 2px dashed var(--border-color) !important;
  transition: all 0.3s ease;
}

.add-photo-btn:hover {
  border-color: var(--primary-color) !important;
  background-color: var(--primary-color-hover) !important;
}

.cell-label {
  font-size: 12px;
  font-weight: 500;
}

/* Generating Cell */
.generating-cell {
  position: relative;
  height: 100%;
}

.generating-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  z-index: 2;
}

/* Filled Cell */
.filled-cell {
  position: relative;
  height: 100%;
}

.cell-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #f5f5f5;
  transition: transform 0.3s ease;
}

.cell-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 3;
}

.photo-cell:hover .cell-overlay {
  opacity: 1;
}

.remove-photo-btn,
.replace-photo-btn {
  background-color: rgba(0, 0, 0, 0.7) !important;
  border: none !important;
  color: white !important;
}

/* Movement Controls */
.movement-controls {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0;
  transition: opacity 0.1s ease;
  z-index: 2;
  pointer-events: none;
}

.photo-cell:hover .movement-controls {
  opacity: 1;
  pointer-events: auto;
}

.move-btn {
  background-color: rgba(255, 255, 255, 0.95) !important;
  color: var(--text-primary) !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  transition: background-color 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: absolute;
}

.move-btn:hover {
  background-color: var(--primary-color) !important;
  color: white !important;
}

/* Forzar visibilidad de iconos en botones direccionales */
.move-btn {
  background-color: var(--primary-color-suppl) !important;
  color: white !important;
}

.move-up {
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.move-down {
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.move-left {
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.move-right {
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

/* Animation for moving photos */
.moving-photo {
  transition: transform 0.1s ease;
  z-index: 10;
}

/* Photo Info Badges */
.photo-info-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background-color: rgba(139, 92, 246, 0.9);
  color: white;
  border-radius: 12px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.photo-info-badge:hover {
  background-color: rgba(139, 92, 246, 1);
}

.generation-info {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
}

.criteria-indicator {
  font-size: 8px;
  opacity: 0.9;
}

.generation-depth {
  font-size: 10px;
}

.original-photo-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background-color: rgba(34, 197, 94, 0.9);
  color: white;
  border-radius: 50%;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Bottom Actions */
.grid-actions-bottom {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
}

/* Responsive */
@media (max-width: 768px) {
  .grid-maker-container {
    padding: var(--spacing-lg);
  }

  .grid-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .control-group {
    justify-content: center;
  }

  .photo-grid-container {
    padding: var(--spacing-lg);
  }

  .grid-preview {
    padding: var(--spacing-md);
  }

  .grid-cell {
    width: 20px;
    height: 20px;
  }

  .grid-row {
    grid-template-columns: repeat(8, 20px);
  }

  .grid-preview {
    grid-template-rows: repeat(8, 20px);
  }
}
</style>
