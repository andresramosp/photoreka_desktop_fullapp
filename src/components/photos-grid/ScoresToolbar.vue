<template>
  <div class="scores-toolbar surface-flat">
    <n-icon size="17" class="st-icon" :component="Trophy20Regular" />

    <!-- Criterios / géneros: siempre a la vista, sin acordeón -->
    <div v-if="type === 'genre'" class="st-pills">
      <n-tooltip
        v-for="genre in genres"
        :key="genre.value"
        trigger="hover"
        placement="bottom"
        :delay="1200"
      >
        <template #trigger>
          <n-button
            :type="selectedGenre === genre.value ? 'primary' : 'default'"
            size="small"
            secondary
            class="st-pill st-pill--genre"
            :class="{ 'st-pill--custom': genre.value === 'custom' }"
            :style="{ '--st-group-color': genrePillColor(genre.value) }"
            @click="emit('select-genre', genre.value)"
          >
            <template #icon>
              <n-icon>
                <component :is="genre.icon" />
              </n-icon>
            </template>
            {{ genre.label }}
          </n-button>
        </template>
        <div
          v-if="genre.value !== 'custom'"
          v-html="formatGenreTooltip(genre.value)"
        ></div>
        <div v-else>Customize your own scoring weights</div>
      </n-tooltip>
    </div>

    <div v-else class="st-pills">
      <n-tooltip
        v-for="pill in criteriaPills"
        :key="pill.value"
        trigger="hover"
        placement="bottom"
        :delay="1200"
        :style="{ maxWidth: '340px' }"
      >
        <template #trigger>
          <n-button
            secondary
            size="small"
            class="st-pill st-pill--score"
            :class="{ 'is-active': pill.active }"
            :type="pill.type"
            :style="{ '--st-group-color': pill.color }"
            @click="emit('toggle-criterion', pill.value)"
          >
            <template #icon>
              <n-icon>
                <component :is="criterionIcons[pill.value]" />
              </n-icon>
            </template>
            {{ formatCriterionName(pill.value) }}
          </n-button>
        </template>
        <div class="st-tip">
          <div class="st-tip-title" :style="{ color: pill.color }">
            {{ formatCriterionName(pill.value) }}
          </div>
          <div class="st-tip-desc">{{ pill.description }}</div>
        </div>
      </n-tooltip>
    </div>

    <div class="st-actions">
      <n-tooltip
        :disabled="!hasActiveSorting"
        trigger="hover"
        placement="bottom"
      >
        <template #trigger>
          <n-button
            text
            size="small"
            class="st-order-btn"
            :focusable="false"
            @click="emit('toggle-order')"
          >
            <n-icon size="16">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px">
                <path
                  v-if="sortOrder === 'desc'"
                  d="M19,17H22L18,21L14,17H17V3H19V17M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
                <path
                  v-else
                  d="M19,7H22L18,3L14,7H17V21H19V7M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
              </svg>
            </n-icon>
          </n-button>
        </template>
        {{
          sortOrder === "desc"
            ? "Best first (click for worst first)"
            : "Worst first (click for best first)"
        }}
      </n-tooltip>

      <!-- Se habilita con `hasSelection`, no con `hasActiveSorting`: hay estados
           en los que hay criterios marcados sin que el ranking esté ordenando, y
           ahí Clear es precisamente lo que hace falta. -->
      <n-button
        v-show="hasSelection"
        text
        size="small"
        class="st-clear"
        :focusable="false"
        @click="emit('clear')"
      >
        Clear
      </n-button>

      <!-- Equivalente al botón de configuración de la quick search bar: aquí
           basta con elegir por qué se rankea. -->
      <ModePopoverSelector
        :model-value="type"
        :options="typeOptions"
        header="Rank by"
        :custom-icon="typeIcon"
        :accent="false"
        :buttonType="'primary'"
        aria-label="Change ranking mode"
        :width="240"
        :single-mode="true"
        @update:model-value="(value) => emit('update:type', value)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButton, NIcon, NTooltip } from "naive-ui";
import { Star20Regular, Tag20Regular, Trophy20Regular } from "@vicons/fluent";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";

const props = defineProps({
  /** 'criteria' | 'genre'. Cualquier otro valor (p.ej. 'none', cuando manda el
   *  sort básico de la grilla) se muestra como 'criteria', que es el modo en el
   *  que no hay nada seleccionado. */
  sortingType: { type: String, default: "criteria" },
  selectedCriteria: { type: Array, default: () => [] },
  selectedGenre: { type: String, default: null },
  sortOrder: { type: String, default: "desc" },
  hasActiveSorting: { type: Boolean, default: false },
  /** Hay criterios o género marcados, ordene o no. Gobierna el botón Clear. */
  hasSelection: { type: Boolean, default: false },
  /** Grupos de criterios de useArtisticScores */
  artisticScores: { type: Object, required: true },
  criterionIcons: { type: Object, default: () => ({}) },
  formatCriterionName: { type: Function, required: true },
  formatGenreTooltip: { type: Function, required: true },
  genres: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:type",
  "toggle-criterion",
  "select-genre",
  "toggle-order",
  "clear",
]);

const type = computed(() =>
  props.sortingType === "genre" ? "genre" : "criteria",
);

const typeOptions = [
  {
    label: "Criteria",
    value: "criteria",
    description: "Rank by the individual scores you pick",
  },
  {
    label: "Genre",
    value: "genre",
    description: "Rank with the weights of a genre preset",
  },
];

// El icono del disparador delata el modo activo, igual que su etiqueta.
const typeIcon = computed(() =>
  type.value === "genre" ? Tag20Regular : Star20Regular,
);

// Cada criterio se pinta con el color de SU grupo (fundamentals / bonus), el
// mismo que usa el tooltip de pesos: viene del esquema (`group.color`), así que
// se pasa como custom property en vez de fijarlo en la hoja de estilos. El
// `type` de naive, que gobierna el fondo del estado activo, sigue el mismo
// reparto: primary para fundamentals, warning para bonus.
// Los géneros no tienen color propio en el esquema, así que toman el de
// fundamentals —el mismo azul de los criterios base— y el preset personalizado
// se separa del resto con el color secundario del tema, como la pill de género
// de la quick search bar. Se lee del esquema en vez de fijar el hex aquí para
// que siga al variante de perfil que toque.
const genrePillColor = (value) =>
  value === "custom"
    ? "var(--secondary-color)"
    : props.artisticScores?.fundamentals?.color || "var(--primary-color)";

const criteriaPills = computed(() =>
  Object.entries(props.artisticScores).flatMap(([groupKey, group]) =>
    group.criteria.map((criterion) => {
      const active = props.selectedCriteria.includes(criterion.value);
      return {
        value: criterion.value,
        color: group.color,
        description: criterion.description,
        active,
        type: active
          ? groupKey === "fundamentals"
            ? "primary"
            : "warning"
          : "default",
      };
    }),
  ),
);
</script>

<style scoped>
.scores-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  padding: 8px 10px;
  border-radius: 6px;
  min-width: 0;
}

.st-icon {
  flex-shrink: 0;
  color: var(--primary-color);
}

.st-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.st-pill {
  flex: 1 1 auto;
  min-width: 0;
  /* color: var(--text-primary); */
  font-size: 12px;
  /* border-radius: 8px; */
  transition: all 0.2s ease;
}

.st-pill.is-active {
  font-weight: 600;
}

/* Fundamentals vs bonus, igual que las pills de género y tag se distinguen en
   la quick search bar. El color llega por `--st-group-color` desde el esquema.
   Ojo si vas a tocar fondo o borde: naive escribe `--n-color` y compañía en el
   atributo `style` del botón, así que eso no se puede cambiar desde aquí sin
   `!important`; por eso el estado activo va por `type`. */
.st-pill--score,
.st-pill--genre {
  color: var(--st-group-color, var(--text-secondary));
}

/* Un punto más de brillo al pasar por encima, como las pills de género y tag.
   Aquí no hay un segundo color por grupo que usar —`--st-group-color` es un hex
   del esquema, no una variable de tema con su pareja `-hover`— así que el tono
   se deriva del propio color acercándolo a `--text-primary`: en oscuro aclara y
   en claro oscurece, o sea, un paso más de contraste en ambos temas. El
   `!important` es por el `--n-text-color-hover` que naive escribe inline. */
.st-pill--score:hover,
.st-pill--genre:hover {
  color: color-mix(
    in srgb,
    var(--st-group-color) 75%,
    var(--text-primary)
  ) !important;
}

/* El tooltip del criterio: título con el color de su grupo y la explicación
   del esquema debajo, que es la misma que se le pide puntuar al modelo. */
.st-tip {
  font-size: 12px;
  line-height: 1.4;
}

.st-tip-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.st-tip-desc {
  color: var(--text-secondary);
  line-height: 1.5;
}

.st-pill--custom {
  border: 1px dashed var(--border-color);
}

.st-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}

.st-order-btn {
  color: var(--text-secondary);
  opacity: 0.7;
  padding: 2px;
}

.st-order-btn:hover {
  opacity: 1;
  color: var(--warning-color);
}

.st-clear {
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 3px;
}

.st-clear:hover {
  color: var(--warning-color);
}

/* Tablet: las pills envuelven a dos columnas antes que recortarse. Por debajo
   de 768px esta barra no llega a montarse: PhotosGridControls vuelve al panel
   plegable, que en una pantalla estrecha aprovecha mucho mejor el alto. */
@media (max-width: 1023px) {
  .st-pills {
    flex-wrap: wrap;
  }

  .st-pill {
    flex: 1 1 calc(50% - 6px);
  }
}
</style>
