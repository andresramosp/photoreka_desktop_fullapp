import { ref, computed, onMounted, onUnmounted } from "vue";
import queryExamples from "@/assets/query_examples.json";

/**
 * Composable para manejar ejemplos rotativos de búsqueda
 * @param {string} searchType - Tipo de búsqueda actual ('semantic', 'tags', 'topological', 'curation')
 * @param {string} searchMode - Modo de búsqueda para semantic ('precise', 'adaptive', etc.)
 * @param {Function} onExampleClick - Función a ejecutar cuando se hace clic en un ejemplo
 */
export function useQueryExamples(
  searchType,
  searchMode = ref("strict"),
  onExampleClick = null
) {
  const exampleIndex = ref(0);
  const isSliding = ref(false);
  let exampleInterval = null;

  // Obtener ejemplos según el tipo de búsqueda
  const currentExamples = computed(() => {
    const type = searchType.value;

    if (type === "semantic") {
      // Para semantic: usar adaptive si está disponible y el modo es adaptive
      if (searchMode.value === "adaptive" && queryExamples.adaptive?.length) {
        return queryExamples.adaptive;
      }
      return queryExamples.precise || [];
    } else if (type === "tags") {
      return queryExamples.tags || [];
    } else if (type === "topological") {
      return queryExamples.topological || [];
    } else if (type === "curation") {
      return queryExamples.curation || [];
    }

    return [];
  });

  // Formatear el texto del ejemplo según el tipo
  const currentExampleText = computed(() => {
    const examples = currentExamples.value;
    const example = examples[exampleIndex.value];

    if (!example) return "";

    const type = searchType.value;

    if (type === "tags") {
      // Mostrar como: Include: tag1, tag2 | Exclude: tag3
      const inc = (example.include || []).join(", ");
      const exc = (example.exclude || []).join(", ");
      return `Include: ${inc}${exc ? `  |  Exclude: ${exc}` : ""}`;
    } else if (type === "topological") {
      // Mostrar solo las cajas presentes, ej: Left: dog | Right: cat
      const parts = [];
      if (example.left) parts.push(`Left: ${example.left}`);
      if (example.center) parts.push(`Center: ${example.center}`);
      if (example.right) parts.push(`Right: ${example.right}`);
      return parts.join("  |  ");
    }

    // Para 'semantic' y 'curation', simplemente devolver el texto
    return example;
  });

  // Manejar clic en ejemplo
  function handleExampleClick() {
    if (onExampleClick && typeof onExampleClick === "function") {
      const example = currentExamples.value[exampleIndex.value];
      onExampleClick(example, currentExampleText.value, searchType.value);
    }
  }

  // Iniciar el carrusel automático
  function startCarousel() {
    if (exampleInterval) return; // Ya está iniciado

    exampleInterval = setInterval(() => {
      isSliding.value = true;
      setTimeout(() => {
        isSliding.value = false;
      }, 300);

      const examples = currentExamples.value;
      if (examples.length > 0) {
        exampleIndex.value = (exampleIndex.value + 1) % examples.length;
      } else {
        exampleIndex.value = 0;
      }
    }, 5000);
  }

  // Detener el carrusel automático
  function stopCarousel() {
    if (exampleInterval) {
      clearInterval(exampleInterval);
      exampleInterval = null;
    }
  }

  // Reiniciar índice cuando cambian los ejemplos
  function resetIndex() {
    exampleIndex.value = 0;
    isSliding.value = false;
  }

  // Lifecycle hooks
  onMounted(() => {
    startCarousel();
  });

  onUnmounted(() => {
    stopCarousel();
  });

  return {
    // Estado reactivo
    exampleIndex,
    isSliding,
    currentExamples,
    currentExampleText,

    // Métodos
    handleExampleClick,
    startCarousel,
    stopCarousel,
    resetIndex,
  };
}
