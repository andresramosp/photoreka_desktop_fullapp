/**
 * Reparto de los métodos de ModelsService entre el escritorio y el servicio de la nube.
 * Lo usan los dos lados (desktop/cloud_bridge.ts y desktop/gateway/), así que no pueden divergir.
 */

/** Cálculo sin propiedad intelectual (servicio Python y RunPod): se reenvían tal cual. */
export const COMPUTE_METHODS = [
  'getEmbeddingsGPU',
  'getEmbeddingsImages',
  'getEmbeddingsImagesCPU',
  'getEmbeddingsCPU',
  'getEmbeddingsCPUBatch',
  'getCLIPEmbeddingsCPU',
  'getReducedEmbeddings',
  'getClusters',
  'getHistogramColor',
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
