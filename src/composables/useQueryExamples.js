import { ref, watch, onMounted, onUnmounted } from "vue";
import queryExamples from "@/assets/query_examples.json";

export function useQueryExamples(searchType, searchMode) {
  const exampleIndex = ref(0);
  const isSliding = ref(false);
  const currentText = ref("");
  let intervalId = null;

  // Obtener el array de ejemplos según tipo y modo
  function getExamples() {
    const type = searchType.value;
    const mode = searchMode.value;

    if (type === "semantic") {
      return queryExamples[mode] || [];
    } else if (type === "tags") {
      return queryExamples.tags || [];
    } else if (type === "topological") {
      return queryExamples.topological || [];
    } else if (type === "curation") {
      return queryExamples.curation || [];
    }
    return [];
  }

  // Actualizar el texto actual basado en el índice
  function updateCurrentText() {
    const examples = getExamples();
    if (examples.length === 0) {
      currentText.value = "";
      return;
    }

    const example = examples[exampleIndex.value];
    const type = searchType.value;

    if (type === "tags" && example) {
      const inc = (example.include || []).join(", ");
      const exc = (example.exclude || []).join(", ");
      currentText.value = `Include: ${inc}${exc ? `  |  Exclude: ${exc}` : ""}`;
    } else {
      currentText.value = example || "";
    }
  }

  // Avanzar al siguiente ejemplo
  function nextExample() {
    const examples = getExamples();
    if (examples.length === 0) return;

    isSliding.value = true;

    setTimeout(() => {
      exampleIndex.value = (exampleIndex.value + 1) % examples.length;
      updateCurrentText();
      isSliding.value = false;
    }, 300);
  }

  // Iniciar carousel
  function startCarousel() {
    if (intervalId) return;
    intervalId = setInterval(nextExample, 5000);
  }

  // Detener carousel
  function stopCarousel() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Watch para cambios en tipo o modo
  watch([searchType, searchMode], () => {
    exampleIndex.value = 0;
    updateCurrentText();
  });

  onMounted(() => {
    updateCurrentText();
    startCarousel();
  });

  onUnmounted(() => {
    stopCarousel();
  });

  return {
    currentText,
    isSliding,
    startCarousel,
    stopCarousel,
  };
}
