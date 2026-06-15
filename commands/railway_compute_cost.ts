import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CPU_COST_PER_VCPU_MINUTE_USD = 0.000463
const RAM_COST_PER_GB_MINUTE_USD = 0.000231

type MetricKind = 'cpu' | 'memory'
type CpuUnit = 'vcpu' | 'percent'
type MemoryUnit = 'gb' | 'mb' | 'bytes'

type Point = {
  timestamp: number
  value: number
}

type CostResult = {
  cpuVcpuMinutes: number
  memoryGbMinutes: number
  cpuCostUsd: number
  memoryCostUsd: number
  totalCostUsd: number
  cpuPoints: number
  memoryPoints: number
}

export default class RailwayComputeCost extends BaseCommand {
  static commandName = 'railway:compute-cost'
  static description = 'Estimate Railway CPU/RAM compute cost for a metrics time window'

  static options: CommandOptions = {
    startApp: false,
  }

  @flags.string({ description: 'Railway service name. Required when not using --metrics-file.' })
  declare service?: string

  @flags.string({ description: 'Railway environment name. Defaults to the linked environment.' })
  declare environment?: string

  @flags.string({ description: 'Start of the measured window, e.g. 1h or ISO 8601.' })
  declare since?: string

  @flags.string({ description: 'End of the measured window, e.g. now, 1h, or ISO 8601.' })
  declare until?: string

  @flags.string({
    description: 'Read one Railway metrics JSON file instead of calling railway metrics.',
  })
  declare metricsFile?: string

  @flags.string({ description: 'Optional idle/baseline metrics JSON file to subtract.' })
  declare baselineFile?: string

  @flags.string({
    description: 'Interpret CPU values as vcpu or percent. Use percent with --cpu-limit-vcpu.',
    default: 'vcpu',
  })
  declare cpuUnit: CpuUnit

  @flags.number({ description: 'Required when --cpu-unit=percent.' })
  declare cpuLimitVcpu?: number

  @flags.string({ description: 'Interpret memory values as gb, mb, or bytes.', default: 'mb' })
  declare memoryUnit: MemoryUnit

  @flags.boolean({
    description: 'Print parsed point counts and integration details.',
    default: false,
  })
  declare verbose: boolean

  async run() {
    this.validateFlags()

    const measuredMetrics = await this.loadMetrics('measured', this.metricsFile)
    const measured = this.calculateCost(measuredMetrics)

    let result = measured
    if (this.baselineFile) {
      const baselineMetrics = await this.loadMetrics('baseline', this.baselineFile)
      const baseline = this.calculateCost(baselineMetrics)
      result = this.subtractBaseline(measured, baseline)
    }

    this.printResult(result)
  }

  private validateFlags() {
    if (!this.metricsFile && (!this.service || !this.since || !this.until)) {
      throw new Error('Provide either --metrics-file or --service, --since, and --until.')
    }

    if (this.cpuUnit !== 'vcpu' && this.cpuUnit !== 'percent') {
      throw new Error('--cpu-unit must be vcpu or percent.')
    }

    if (this.cpuUnit === 'percent' && !this.cpuLimitVcpu) {
      throw new Error('--cpu-limit-vcpu is required when --cpu-unit=percent.')
    }

    if (!['gb', 'mb', 'bytes'].includes(this.memoryUnit)) {
      throw new Error('--memory-unit must be gb, mb, or bytes.')
    }
  }

  private async loadMetrics(label: string, filePath?: string) {
    if (filePath) {
      this.logger.info(`Reading ${label} metrics from ${filePath}`)
      const raw = await readFile(filePath)
      return JSON.parse(this.decodeJsonText(raw))
    }

    this.logger.info(`Fetching ${label} metrics from Railway CLI`)
    const args = ['metrics', '--cpu', '--memory', '--raw', '--json']

    if (this.service) args.push('--service', this.service)
    if (this.environment) args.push('--environment', this.environment)
    if (this.since) args.push('--since', this.since)
    if (this.until) args.push('--until', this.until)

    const { stdout } = await execFileAsync('railway', args, {
      maxBuffer: 1024 * 1024 * 20,
    })

    return JSON.parse(this.decodeJsonText(Buffer.from(stdout)))
  }

  private decodeJsonText(raw: Buffer): string {
    // Support UTF-8, UTF-8 with BOM, UTF-16 LE BOM, and UTF-16 BE BOM.
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

  private calculateCost(metrics: unknown): CostResult {
    const cpuPoints = this.extractSeries(metrics, 'cpu').map((point) => ({
      timestamp: point.timestamp,
      value: this.normalizeCpu(point.value),
    }))
    const memoryPoints = this.extractSeries(metrics, 'memory').map((point) => ({
      timestamp: point.timestamp,
      value: this.normalizeMemory(point.value),
    }))

    if (cpuPoints.length < 2) {
      throw new Error(`Could not find enough CPU raw data points (${cpuPoints.length}).`)
    }

    if (memoryPoints.length < 2) {
      throw new Error(`Could not find enough memory raw data points (${memoryPoints.length}).`)
    }

    const cpuVcpuMinutes = this.integrate(cpuPoints)
    const memoryGbMinutes = this.integrate(memoryPoints)
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

  private extractSeries(metrics: unknown, kind: MetricKind): Point[] {
    const candidates: Point[][] = []

    const visit = (value: unknown, path: string[]) => {
      if (!value || typeof value !== 'object') return

      if (Array.isArray(value)) {
        const points = this.pointsFromArray(value)
        if (points.length >= 2 && this.pathLooksLikeKind(path, kind)) {
          candidates.push(points)
        }

        for (const item of value) visit(item, path)
        return
      }

      const contextPath = [...path, ...this.metricContextLabels(value as Record<string, unknown>)]

      for (const [key, child] of Object.entries(value)) {
        visit(child, [...contextPath, key])
      }
    }

    visit(metrics, [])

    const selected = candidates.sort((a, b) => b.length - a.length)[0] ?? []
    return this.dedupeAndSort(selected)
  }

  private pointsFromArray(items: unknown[]): Point[] {
    const points: Point[] = []

    for (const item of items) {
      const point = this.pointFromValue(item)
      if (point) points.push(point)
    }

    return points
  }

  private pointFromValue(value: unknown): Point | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const record = value as Record<string, unknown>
    const timestamp = this.readTimestamp(record)
    const metricValue = this.readMetricValue(record)

    if (timestamp === null || metricValue === null) return null
    return { timestamp, value: metricValue }
  }

  private readTimestamp(record: Record<string, unknown>): number | null {
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

  private readMetricValue(record: Record<string, unknown>): number | null {
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

  private pathLooksLikeKind(path: string[], kind: MetricKind): boolean {
    const normalized = path.join('.').toLowerCase()
    if (kind === 'cpu') return normalized.includes('cpu') || normalized.includes('vcpu')
    return normalized.includes('memory') || normalized.includes('ram')
  }

  private metricContextLabels(record: Record<string, unknown>): string[] {
    const labels: string[] = []

    for (const key of ['name', 'metric', 'type', 'label', 'title', 'group']) {
      const value = record[key]
      if (typeof value === 'string') labels.push(value)
    }

    return labels
  }

  private dedupeAndSort(points: Point[]): Point[] {
    const byTimestamp = new Map<number, Point>()
    for (const point of points) byTimestamp.set(point.timestamp, point)
    return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp)
  }

  private normalizeCpu(value: number): number {
    if (this.cpuUnit === 'percent') {
      return (value / 100) * this.cpuLimitVcpu!
    }
    return value
  }

  private normalizeMemory(value: number): number {
    if (this.memoryUnit === 'bytes') return value / 1024 / 1024 / 1024
    if (this.memoryUnit === 'mb') return value / 1024
    return value
  }

  private integrate(points: Point[]): number {
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

  private subtractBaseline(measured: CostResult, baseline: CostResult): CostResult {
    const cpuVcpuMinutes = Math.max(0, measured.cpuVcpuMinutes - baseline.cpuVcpuMinutes)
    const memoryGbMinutes = Math.max(0, measured.memoryGbMinutes - baseline.memoryGbMinutes)
    const cpuCostUsd = cpuVcpuMinutes * CPU_COST_PER_VCPU_MINUTE_USD
    const memoryCostUsd = memoryGbMinutes * RAM_COST_PER_GB_MINUTE_USD

    return {
      cpuVcpuMinutes,
      memoryGbMinutes,
      cpuCostUsd,
      memoryCostUsd,
      totalCostUsd: cpuCostUsd + memoryCostUsd,
      cpuPoints: measured.cpuPoints,
      memoryPoints: measured.memoryPoints,
    }
  }

  private printResult(result: CostResult) {
    this.logger.info(`CPU: ${result.cpuVcpuMinutes.toFixed(6)} vCPU-min`)
    this.logger.info(`RAM: ${result.memoryGbMinutes.toFixed(6)} GB-min`)
    this.logger.info(`CPU cost: $${result.cpuCostUsd.toFixed(6)}`)
    this.logger.info(`RAM cost: $${result.memoryCostUsd.toFixed(6)}`)
    this.logger.success(`Estimated Railway compute cost: $${result.totalCostUsd.toFixed(6)}`)

    if (this.verbose) {
      this.logger.info(`CPU points parsed: ${result.cpuPoints}`)
      this.logger.info(`RAM points parsed: ${result.memoryPoints}`)
      this.logger.info(`CPU rate: $${CPU_COST_PER_VCPU_MINUTE_USD}/vCPU-min`)
      this.logger.info(`RAM rate: $${RAM_COST_PER_GB_MINUTE_USD}/GB-min`)
    }
  }
}
