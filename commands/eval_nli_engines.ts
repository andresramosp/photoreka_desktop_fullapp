import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ModelsService from '#services/models_service'
import LogicInferenceService, { LogicInferenceEngine } from '#services/logic_inference_service'
import { CostTracker, createTrackedModelsService } from '../app/utils/cost_tracker.js'
import type { NLILabel, NLITermsType } from '../app/utils/nli_jev.js'
import { resolveJevProvider } from '../app/utils/jev_provider.js'

/**
 * Battery against the NLI engines behind precise search (LogicInferenceService).
 *
 *   node ace eval:nli-engines [--engines=JEV,LLM] [--only=tag|desc] [--verbose]
 *
 * Every case is a (term, candidate, expected label) triple. Cases are grouped per term so
 * each engine sees them the way production does: one call with all the candidates of a
 * term. Runs with the Redis cache ON (identical inputs are deterministic), so re-running
 * after a prompt change only re-bills the batches whose text changed.
 *
 * The labels under test are the ones the prompts single out as failure modes:
 *   - the hypernym trap (broader category must be neutral, never entailment)
 *   - unrelated ≠ contradiction
 *   - the conjunction rule for multi-concept terms on description fragments
 * The summary counts, per engine, accuracy plus the two expensive error kinds separately:
 * false entailments (a wrong photo surfaces) and missed entailments (a right photo is filtered).
 */

type Case = { term: string; candidate: string; expected: NLILabel; note?: string }

// prettier-ignore
const TAG_CASES: Case[] = [
  // ── Hyponyms / synonyms → entailment ───────────────────────────────────
  { term: 'dog',          candidate: 'golden retriever',        expected: 'entailment' },
  { term: 'dog',          candidate: 'puppy',                   expected: 'entailment' },
  { term: 'cat',          candidate: 'tabby',                   expected: 'entailment' },
  { term: 'cat',          candidate: 'kitten',                  expected: 'entailment' },
  { term: 'bird',         candidate: 'seagull',                 expected: 'entailment' },
  { term: 'vehicle',      candidate: 'red bicycle',             expected: 'entailment' },
  { term: 'water',        candidate: 'ocean waves',             expected: 'entailment' },
  { term: 'portrait',     candidate: 'close-up of a woman face', expected: 'entailment' },
  { term: 'night',        candidate: 'starry sky',              expected: 'entailment' },
  { term: 'food',         candidate: 'margherita pizza',        expected: 'entailment' },

  // ── Hypernym trap → neutral ─────────────────────────────────────────────
  { term: 'cat',          candidate: 'domestic animals',        expected: 'neutral', note: 'hypernym' },
  { term: 'cat',          candidate: 'pet',                     expected: 'neutral', note: 'hypernym' },
  { term: 'cat',          candidate: 'mammal',                  expected: 'neutral', note: 'hypernym' },
  { term: 'dog',          candidate: 'animal',                  expected: 'neutral', note: 'hypernym' },
  { term: 'seagull',      candidate: 'bird',                    expected: 'neutral', note: 'hypernym' },
  { term: 'golden retriever', candidate: 'dog',                 expected: 'neutral', note: 'hypernym' },
  { term: 'pizza',        candidate: 'food',                    expected: 'neutral', note: 'hypernym' },
  { term: 'bicycle',      candidate: 'vehicle',                 expected: 'neutral', note: 'hypernym' },

  // ── Siblings / co-occurring / unrelated → neutral ──────────────────────
  { term: 'cat',          candidate: 'dog',                     expected: 'neutral', note: 'sibling' },
  { term: 'dog',          candidate: 'grass field',             expected: 'neutral' },
  { term: 'dog',          candidate: 'leash',                   expected: 'neutral', note: 'co-occurring' },
  { term: 'beach',        candidate: 'sunglasses',              expected: 'neutral', note: 'co-occurring' },
  { term: 'cat',          candidate: 'brick wall',              expected: 'neutral', note: 'unrelated' },
  { term: 'mountain',     candidate: 'laptop',                  expected: 'neutral', note: 'unrelated' },

  // ── Mutual exclusivity → contradiction ─────────────────────────────────
  { term: 'indoor scene', candidate: 'open desert',             expected: 'contradiction' },
  { term: 'cat',          candidate: 'empty landscape, no animals', expected: 'contradiction' },
  { term: 'night',        candidate: 'bright midday sun',       expected: 'contradiction' },
  { term: 'crowd',        candidate: 'deserted street, nobody around', expected: 'contradiction' },
  { term: 'color photo',  candidate: 'black and white',         expected: 'contradiction' },
]

// prettier-ignore
const DESC_CASES: Case[] = [
  // ── Every concept explicitly supported → entailment ────────────────────
  { term: 'cats and kids in an African country', candidate: 'Two children in Nairobi, Kenya, play with a striped cat on a doorstep.', expected: 'entailment' },
  { term: 'woman reading a book',                candidate: 'A young woman sits on a bench absorbed in a paperback novel.',           expected: 'entailment' },
  { term: 'dog on a beach',                      candidate: 'A wet labrador shakes off seawater on the sand next to the surf.',       expected: 'entailment' },
  { term: 'rainy street at night',               candidate: 'Neon signs reflect on the wet asphalt of a dark downtown avenue after midnight rain.', expected: 'entailment' },

  // ── Partial support (conjunction rule) → neutral ───────────────────────
  { term: 'cats and kids in an African country', candidate: 'A vibrant market scene in Marrakech with spice stalls.',                expected: 'neutral', note: 'country only' },
  { term: 'cats and kids in an African country', candidate: 'Children run after a football in a dusty schoolyard.',                 expected: 'neutral', note: 'kids only, country unstated' },
  { term: 'cats and kids in an African country', candidate: 'A cat naps on a windowsill in Lagos.',                                  expected: 'neutral', note: 'cat + country, no kids' },
  { term: 'dog on a beach',                      candidate: 'A golden retriever runs across a grassy park.',                         expected: 'neutral', note: 'dog only' },
  { term: 'woman reading a book',                candidate: 'A woman holds a coffee cup and looks out of the window.',               expected: 'neutral', note: 'woman only' },

  // ── Plausible but unmentioned → neutral ────────────────────────────────
  { term: 'children playing',                    candidate: 'A colourful playground with swings and a slide in the afternoon light.', expected: 'neutral', note: 'no children stated' },
  { term: 'birds',                               candidate: 'A quiet lake surrounded by reeds at dawn.',                             expected: 'neutral', note: 'no birds stated' },

  // ── Explicit exclusion → contradiction ─────────────────────────────────
  { term: 'cats and kids in an African country', candidate: 'An empty Sahara dune landscape with no people or animals in sight.',    expected: 'contradiction' },
  { term: 'dog on a beach',                      candidate: 'A snowy mountain summit far from any coast.',                          expected: 'contradiction' },
  { term: 'crowded concert',                     candidate: 'An empty theatre with all seats vacant and the stage dark.',            expected: 'contradiction' },
]

type EngineRun = {
  engine: LogicInferenceEngine
  correct: number
  total: number
  falseEntailments: Case[]
  missedEntailments: Case[]
  otherErrors: Array<Case & { got: NLILabel }>
  ms: number
  costEur: number
}

function labelFromLogicProximity(value: number): NLILabel {
  if (value > 1) return 'entailment'
  if (value < 1) return 'contradiction'
  return 'neutral'
}

function groupByTerm(cases: Case[]): Map<string, Case[]> {
  const out = new Map<string, Case[]>()
  for (const c of cases) {
    if (!out.has(c.term)) out.set(c.term, [])
    out.get(c.term)!.push(c)
  }
  return out
}

export default class EvalNliEngines extends BaseCommand {
  static commandName = 'eval:nli-engines'
  static description = 'Battery against the NLI engines (JEV vs LLM) behind precise search'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Comma-separated engines to run: JEV,LLM,BERT', default: 'JEV,LLM' })
  declare engines: string

  @flags.string({ description: 'Restrict to one input type: tag | desc' })
  declare only?: string

  @flags.boolean({ description: 'Print every case, not only the failures' })
  declare verbose: boolean

  async run() {
    const engines = this.engines
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter((e): e is LogicInferenceEngine =>
        (Object.values(LogicInferenceEngine) as string[]).includes(e)
      )
      .filter((e) => e !== LogicInferenceEngine.AUTO)

    if (engines.length === 0) {
      this.logger.error('No valid engine in --engines (expected JEV, LLM or BERT)')
      this.exitCode = 1
      return
    }

    const suites: Array<{ termsType: NLITermsType; cases: Case[] }> = [
      { termsType: 'tag', cases: TAG_CASES },
      { termsType: 'desc', cases: DESC_CASES },
    ].filter((s) => !this.only || s.termsType === this.only) as Array<{
      termsType: NLITermsType
      cases: Case[]
    }>

    const service = new LogicInferenceService()
    const jev = resolveJevProvider()
    this.logger.info(
      `Jev provider: ${jev.name} (${jev.url}) — key ${jev.apiKey ? 'set' : 'MISSING → JEV runs as LLM'}`
    )

    for (const suite of suites) {
      this.logger.info(`\n═══ ${suite.termsType.toUpperCase()} cases (${suite.cases.length}) ═══`)
      const runs: EngineRun[] = []

      for (const engine of engines) {
        const tracker = new CostTracker('search')
        const modelsService = createTrackedModelsService(new ModelsService(), tracker)
        const run: EngineRun = {
          engine,
          correct: 0,
          total: 0,
          falseEntailments: [],
          missedEntailments: [],
          otherErrors: [],
          ms: 0,
          costEur: 0,
        }

        const started = Date.now()
        for (const [term, cases] of groupByTerm(suite.cases)) {
          const texts = cases.map((c) => ({ name: c.candidate, proximity: 1 }))
          const out = await service.adjustProximitiesByContextInference(
            modelsService,
            term,
            texts,
            0,
            suite.termsType,
            engine
          )
          const byName = new Map(out.map((t: any) => [t.name, t.logicProximity as number]))

          for (const c of cases) {
            const value = byName.get(c.candidate)
            const got = value === undefined ? 'neutral' : labelFromLogicProximity(value)
            run.total++
            const ok = got === c.expected
            if (ok) run.correct++
            else if (got === 'entailment') run.falseEntailments.push(c)
            else if (c.expected === 'entailment') run.missedEntailments.push(c)
            else run.otherErrors.push({ ...c, got })

            if (this.verbose || !ok) {
              const mark = ok ? '  ok ' : ' FAIL'
              const conf =
                value === undefined ? ' (no verdict)' : ` (logicProx=${value.toFixed(2)})`
              this.logger.log(
                `${mark} [${engine}] "${c.term}" ⇐ "${c.candidate}" → ${got}${conf}, expected ${c.expected}${c.note ? ` [${c.note}]` : ''}`
              )
            }
          }
        }
        run.ms = Date.now() - started
        run.costEur = tracker.getTotal()
        runs.push(run)
      }

      this.logger.info(`\n─── ${suite.termsType} summary ───`)
      for (const r of runs) {
        const acc = ((100 * r.correct) / Math.max(1, r.total)).toFixed(1)
        this.logger.log(
          `${r.engine.padEnd(5)} accuracy ${acc}% (${r.correct}/${r.total}) | false entailments ${r.falseEntailments.length} | missed entailments ${r.missedEntailments.length} | other ${r.otherErrors.length} | ${r.ms} ms | €${r.costEur.toFixed(6)} (cached batches cost €0)`
        )
      }
    }
  }
}
