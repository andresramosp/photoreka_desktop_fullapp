/**
 * Shared Railway compute-cost calculation logic.
 * Used by both the `railway:compute-cost` Ace command and the AnalyzerProcessRunner
 * to measure infra cost of an analysis window across multiple services.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const CPU_COST_PER_VCPU_MINUTE_USD = 0.000463
export const RAM_COST_PER_GB_MINUTE_USD = 0.000231

type MetricKind = 'cpu' | 'memory'
type Point = { timestamp: number; value: number }

export type ServiceCostResult = {
  service: string
  cpuVcpuMinutes: number
  memoryGbMinutes: number
  cpuCostUsd: number
  memoryCostUsd: number
  totalCostUsd: number
  cpuPoints: number
  memoryPoints: number
  error?: string
}

// ── JSON decode helpers ──────────────────────────────────────────────────────

export function decodeJsonText(raw: Buffer): string {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.toString('utf16le').replace(/^\uFEFF/, '')
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(raw.length - 2)
    for (let i = 2; i + 1 < raw.length; i += 2) {
      swapped[i - 2] = raw[i + 1]
      swapped[i - 1] = raw[i]
    }
    return swapped.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return raw.toString('utf8').replace(/^\uFEFF/, '')
}

// ── Railway CLI ──────────────────────────────────────────────────────────────

/**
 * Calls `railway metrics` CLI and returns the raw parsed JSON.
 * Requires `railway` CLI to be installed and RAILWAY_TOKEN to be set.
 */
export async function fetchRailwayMetrics(
  service: string,
  environment: string,
  since: string,
  until: string
): Promise<unknown> {
  const token = process.env.RAILWAY_TOKEN
  if (!token) {
    throw new Error('RAILWAY_TOKEN is not configured')
  }

  const args = [
    'metrics',
    '--service',
    service,
    '--environment',
    environment,
    '--since',
    since,
    '--until',
    until,
    '--cpu',
    '--memory',
    '--raw',
    '--json',
  ]
  const { stdout } = await execFileAsync('railway', args, {
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, RAILWAY_TOKEN: token },
  })
  return JSON.parse(decodeJsonText(Buffer.from(stdout)))
}

// ── Cost calculation ─────────────────────────────────────────────────────────

/**
 * Calculates cost from raw Railway metrics JSON.
 * Assumes CPU in vCPU and memory in MB (Railway CLI defaults).
 */
export function calculateCostFromMetrics(
  metrics: unknown
): Omit<ServiceCostResult, 'service' | 'error'> {
  const cpuPoints = extractSeries(metrics, 'cpu')
  // Railway CLI returns memory in MB; convert to GB for GB-minute integration
  const memoryPoints = extractSeries(metrics, 'memory').map((p) => ({
    ...p,
    value: p.value / 1024,
  }))

  if (cpuPoints.length < 2) {
    throw new Error(`Not enough CPU data points (${cpuPoints.length})`)
  }
  if (memoryPoints.length < 2) {
    throw new Error(`Not enough memory data points (${memoryPoints.length})`)
  }

  const cpuVcpuMinutes = integrate(cpuPoints)
  const memoryGbMinutes = integrate(memoryPoints)
  const cpuCostUsd = cpuVcpuMinutes * CPU_COST_PER_VCPU_MINUTE_USD
  const memoryCostUsd = memoryGbMinutes * RAM_COST_PER_GB_MINUTE_USD

  return {
    cpuVcpuMinutes,
    memoryGbMinutes,
    cpuCostUsd,
    memoryCostUsd,
    totalCostUsd: cpuCostUsd + memoryCostUsd,
    cpuPoints: cpuPoints.length,
    memoryPoints: memoryPoints.length,
  }
}

/**
 * Fetches Railway metrics for a single service and returns the computed cost.
 * Returns a result with error field (and zero costs) if the CLI call or
 * calculation fails, so callers can still sum the other services.
 */
export async function measureServiceCost(
  service: string,
  environment: string,
  since: string,
  until: string
): Promise<ServiceCostResult> {
  try {
    const metrics = await fetchRailwayMetrics(service, environment, since, until)
    const result = calculateCostFromMetrics(metrics)
    return { service, ...result }
  } catch (error) {
    return {
      service,
      cpuVcpuMinutes: 0,
      memoryGbMinutes: 0,
      cpuCostUsd: 0,
      memoryCostUsd: 0,
      totalCostUsd: 0,
      cpuPoints: 0,
      memoryPoints: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ── Private series-extraction helpers ────────────────────────────────────────

function extractSeries(metrics: unknown, kind: MetricKind): Point[] {
  const candidates: Point[][] = []

  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      const pts = pointsFromArray(value)
      if (pts.length >= 2 && pathLooksLikeKind(path, kind)) {
        candidates.push(pts)
      }
      for (const item of value) visit(item, path)
      return
    }

    const record = value as Record<string, unknown>
    const contextPath = [...path, ...metricContextLabels(record)]
    for (const [key, child] of Object.entries(record)) {
      visit(child, [...contextPath, key])
    }
  }

  visit(metrics, [])
  const selected = candidates.sort((a, b) => b.length - a.length)[0] ?? []
  return dedupeAndSort(selected)
}

function pointsFromArray(items: unknown[]): Point[] {
  const points: Point[] = []
  for (const item of items) {
    const p = pointFromValue(item)
    if (p) points.push(p)
  }
  return points
}

function pointFromValue(value: unknown): Point | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const timestamp = readTimestamp(record)
  const metricValue = readMetricValue(record)
  if (timestamp === null || metricValue === null) return null
  return { timestamp, value: metricValue }
}

function readTimestamp(record: Record<string, unknown>): number | null {
  for (const key of ['timestamp', 'ts', 'time', 'date', 'x', 'createdAt']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 10_000_000_000 ? value * 1000 : value
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function readMetricValue(record: Record<string, unknown>): number | null {
  for (const key of ['value', 'usage', 'y', 'avg', 'average', 'mean']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function pathLooksLikeKind(path: string[], kind: MetricKind): boolean {
  const normalized = path.join('.').toLowerCase()
  if (kind === 'cpu') return normalized.includes('cpu') || normalized.includes('vcpu')
  return normalized.includes('memory') || normalized.includes('ram')
}

function metricContextLabels(record: Record<string, unknown>): string[] {
  const labels: string[] = []
  for (const key of ['name', 'metric', 'type', 'label', 'title', 'group']) {
    const value = record[key]
    if (typeof value === 'string') labels.push(value)
  }
  return labels
}

function dedupeAndSort(points: Point[]): Point[] {
  const byTimestamp = new Map<number, Point>()
  for (const point of points) byTimestamp.set(point.timestamp, point)
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function integrate(points: Point[]): number {
  let minutes = 0
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    const deltaMinutes = (current.timestamp - previous.timestamp) / 1000 / 60
    if (deltaMinutes <= 0) continue
    minutes += ((previous.value + current.value) / 2) * deltaMinutes
  }
  return minutes
}
