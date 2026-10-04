import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import app from '@adonisjs/core/services/app'
import http from 'node:http'
import fs from 'node:fs/promises'
import {
  BenchInputError,
  benchDefaults,
  getReport,
  listReports,
  listUserPhotos,
  runBench,
  sampleUserPhotos,
  searchUsers,
  type BenchConfig,
  type BenchReport,
} from '#services/artistic_bench_service'

/**
 * Interfaz local del banco de artistic_scores.
 *
 *   node ace artistic-bench:serve [--port=4100]
 *
 * Escucha solo en 127.0.0.1 y no tiene autenticación: es una herramienta de desarrollo
 * que lanza llamadas de pago, no debe exponerse. Solo admite una prueba a la vez.
 */

type Job = {
  id: string
  status: 'running' | 'done' | 'error'
  log: string[]
  report?: BenchReport
  error?: string
}

const UI_FILE = 'resources/artistic_bench/index.html'
const MAX_BODY = 1_000_000

export default class ArtisticBenchServe extends BaseCommand {
  static commandName = 'artistic-bench:serve'
  static description = 'Serves the local UI of the artistic_scores model bench'
  static options: CommandOptions = { startApp: true, staysAlive: true }

  @flags.number({ description: 'Port to listen on (localhost only)', default: 5174 })
  declare port: number

  private jobs = new Map<string, Job>()
  private running: Job | null = null

  async run() {
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        const isInput = err instanceof BenchInputError
        if (!isInput)
          this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
        this.json(res, isInput ? 400 : 500, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    })
    server.listen(this.port, '127.0.0.1', () => {
      this.logger.success(`Banco artistic_scores en http://localhost:${this.port}`)
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    if (method === 'GET' && url.pathname === '/') {
      const html = await fs.readFile(app.makePath(UI_FILE), 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (parts[0] !== 'api') return this.json(res, 404, { error: 'Not found' })

    if (method === 'GET' && parts[1] === 'defaults') {
      return this.json(res, 200, benchDefaults())
    }
    if (method === 'GET' && parts[1] === 'users' && parts.length === 2) {
      return this.json(res, 200, await searchUsers(url.searchParams.get('q') ?? ''))
    }
    if (method === 'GET' && parts[1] === 'users' && parts[3] === 'photos') {
      const page = Number(url.searchParams.get('page') ?? 1) || 1
      const perPage = Math.min(Number(url.searchParams.get('perPage') ?? 60) || 60, 200)
      return this.json(res, 200, await listUserPhotos(Number(parts[2]), page, perPage))
    }
    if (method === 'GET' && parts[1] === 'users' && parts[3] === 'sample') {
      const n = Number(url.searchParams.get('n') ?? 32) || 32
      const balanced = url.searchParams.get('balanced') !== '0'
      const profile = url.searchParams.get('profile') || null
      return this.json(res, 200, await sampleUserPhotos(Number(parts[2]), n, { profile, balanced }))
    }
    if (method === 'POST' && parts[1] === 'runs') {
      if (this.running) {
        return this.json(res, 409, { error: 'Ya hay una prueba en marcha', id: this.running.id })
      }
      const config = (await this.readJson(req)) as BenchConfig
      return this.json(res, 202, { id: this.start(config).id })
    }
    if (method === 'GET' && parts[1] === 'runs' && parts[2]) {
      const job = this.jobs.get(parts[2])
      return job ? this.json(res, 200, job) : this.json(res, 404, { error: 'Prueba no encontrada' })
    }
    if (method === 'GET' && parts[1] === 'runs') {
      return this.json(res, 200, { running: this.running?.id ?? null })
    }
    if (method === 'GET' && parts[1] === 'reports' && parts[2]) {
      return this.json(res, 200, await getReport(parts[2]))
    }
    if (method === 'GET' && parts[1] === 'reports') {
      return this.json(res, 200, await listReports())
    }
    return this.json(res, 404, { error: 'Not found' })
  }

  private start(config: BenchConfig): Job {
    const job: Job = { id: String(Date.now()), status: 'running', log: [] }
    const log = (message: string) => {
      job.log.push(`${new Date().toLocaleTimeString()}  ${message}`)
      this.logger.info(message)
    }
    this.jobs.set(job.id, job)
    this.running = job

    runBench(config, log)
      .then((report) => {
        job.report = report
        job.status = 'done'
        log('Prueba terminada')
      })
      .catch((err) => {
        job.status = 'error'
        job.error = err instanceof Error ? err.message : String(err)
        log(`Error: ${job.error}`)
      })
      .finally(() => {
        this.running = null
      })
    return job
  }

  private readJson(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > MAX_BODY) {
          reject(new BenchInputError('Petición demasiado grande'))
          req.destroy()
        }
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'))
        } catch {
          reject(new BenchInputError('JSON no válido'))
        }
      })
      req.on('error', reject)
    })
  }

  private json(res: http.ServerResponse, status: number, data: unknown) {
    if (res.headersSent) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }
}
