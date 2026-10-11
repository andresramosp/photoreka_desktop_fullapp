/**
 * Reparto de los métodos de ModelsService entre el escritorio y el servicio de la nube.
 * Lo usan los dos lados (desktop/cloud_bridge.ts y desktop/gateway/), así que no pueden divergir.
 */

/** Cálculo que el escritorio hace en local (desktop/ml), con resultados idénticos al servicio Python. */
export const LOCAL_COMPUTE_METHODS = ['getEmbeddingsCPU', 'getCLIPEmbeddingsCPU', 'getEmbeddingsImagesCPU'] as const

/** Cálculo del servicio Python que aún pasa por la nube, hasta portarlo al escritorio. */
export const COMPUTE_METHODS = ['getReducedEmbeddings', 'getClusters', 'getHistogramColor'] as const

/** Métodos de cálculo que nadie llama (RunPod, mapas de presencia, detección...): desactivados. */
export const UNUSED_COMPUTE_METHODS = [
  'getEmbeddingsGPU',
  'getEmbeddingsImages',
  'getEmbeddingsCPUBatch',
  'getPresenceMaps',
  'getObjectsDetections',
  'findSimilarPresenceMaps',
  'cleanDescriptions',
] as const

/** Calentar servicios de cálculo: en el escritorio no hace nada; lo hace el servicio. */
export const WARMUP_METHODS = ['isRunPodEndpointWarm', 'triggerRunPodWarm', 'ensureRunPodWarm', 'ensureCPUApiWarm'] as const

/** Modelos de lenguaje: en el escritorio solo a través de funciones con nombre del servicio. */
export const LLM_METHODS = [
  'getQwenResponse',
  'getMolmoResponse',
  'getGPTResponse',
  'getGeminiResponse',
  'getJevResponse',
  'getClaudeResponse',
  'getDSResponse',
  'submitGPTBatch',
  'getBatchStatus',
  'getBatchResults',
  'submitGeminiBatch',
  'getGeminiBatchStatus',
  'getGeminiBatchResultsInline',
] as const

/** Métodos que las tareas de análisis pueden pedir al servicio, con su prompt reconstruido allí. */
export const ANALYSIS_TASK_METHODS = [
  'getGPTResponse',
  'getGeminiResponse',
  'getQwenResponse',
  'submitGPTBatch',
  'getBatchStatus',
  'getBatchResults',
] as const

export type ComputeMethod = (typeof COMPUTE_METHODS)[number]
export type AnalysisTaskMethod = (typeof ANALYSIS_TASK_METHODS)[number]
