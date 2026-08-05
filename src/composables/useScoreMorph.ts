import { onBeforeUnmount, ref } from "vue";

/** Duración del viaje entre el antes y el después. */
const DEFAULT_DURATION_MS = 900;

/**
 * Animación del recorrido entre los scores originales y los corregidos.
 *
 * Se anima en JS y no con una transición CSS porque las cifras tienen que moverse
 * a la vez que las barras: una sola `phase` alimenta a todas, así que nunca se
 * desincronizan.
 */
export function useScoreMorph(durationMs = DEFAULT_DURATION_MS) {
  /** 0 = valores originales del LLM, 1 = valores corregidos. */
  const phase = ref(0);
  let frame = 0;

  function morphTo(target: number) {
    const from = phase.value;
    if (target === from) return;

    cancelAnimationFrame(frame);
    const startedAt = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // easeInOutCubic: arranca y frena suave, así el ojo sigue la barra.
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      phase.value = from + (target - from) * eased;
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
  }

  /** Va al otro extremo del que esté más cerca ahora mismo. */
  function toggle() {
    morphTo(phase.value < 0.5 ? 1 : 0);
  }

  /** Vuelve al original sin animar (al reutilizar la tarjeta con otra foto). */
  function reset() {
    cancelAnimationFrame(frame);
    phase.value = 0;
  }

  onBeforeUnmount(() => cancelAnimationFrame(frame));

  return { phase, morphTo, toggle, reset };
}
