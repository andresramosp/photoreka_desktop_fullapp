import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import {
  calculateCostFromMetrics,
  CPU_COST_PER_VCPU_MINUTE_USD,
  decodeJsonText,
  RAM_COST_PER_GB_MINUTE_USD,
  type CostCalculationOptions,
  type CpuUnit,
  type MemoryUnit,
} from '../app/utils/railway_cost_calculator.js'

const execFileAsync = promisify(execFile)

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
    description:
      'Interpret CPU values as auto, vcpu, percent, or millicores. Use percent with --cpu-limit-vcpu.',
    default: 'auto',
  })
  declare cpuUnit: CpuUnit

  @flags.number({ description: 'Required when --cpu-unit=percent.' })
  declare cpuLimitVcpu?: number

  @flags.string({
    description: 'Interpret memory values as auto, gb, mb, or bytes.',
    default: 'auto',
  })
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

    if (!['auto', 'vcpu', 'percent', 'millicores'].includes(this.cpuUnit)) {
      throw new Error('--cpu-unit must be auto, vcpu, percent, or millicores.')
    }

    if (this.cpuUnit === 'percent' && !this.cpuLimitVcpu) {
      throw new Error('--cpu-limit-vcpu is required when --cpu-unit=percent.')
    }

    if (!['auto', 'gb', 'mb', 'bytes'].includes(this.memoryUnit)) {
      throw new Error('--memory-unit must be auto, gb, mb, or bytes.')
    }
  }

  private async loadMetrics(label: string, filePath?: string) {
    if (filePath) {
      this.logger.info(`Reading ${label} metrics from ${filePath}`)
      const raw = await readFile(filePath)
      return JSON.parse(decodeJsonText(raw))
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

    return JSON.parse(decodeJsonText(Buffer.from(stdout)))
  }

  private calculateCost(metrics: unknown): CostResult {
    const options: CostCalculationOptions = {
      cpuUnit: this.cpuUnit,
      cpuLimitVcpu: this.cpuLimitVcpu,
      memoryUnit: this.memoryUnit,
    }
    return calculateCostFromMetrics(metrics, options)
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
