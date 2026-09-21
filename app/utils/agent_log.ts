import { compactPreview } from './agent_utils.js'

// ─── Console log formatting for the agent pipeline ──────────────────────────
//
// A run reads as four blocks — 🚀 chat → 🔍 phase 1 → 🧠 phase 2 → 🏁 result —
// separated by a blank line and a titled rule. Inside a block every line is
// `[Agent] <icon> <label>  <value>`: the icon names the category at a glance,
// the padded label keeps the values in one column.
//
// The icon belongs to the label, not to the call site (see LABEL_ICONS): the
// same kind of event must look identical everywhere it is logged, and that is
// only guaranteed if one table decides it.
//
// Only emoji WITHOUT a variation selector are used here. The VS16 ones (⚠️, 👁️,
// 🖼️…) render one cell wider in some terminals and drag the whole label column
// with them, which is exactly the misalignment this layout exists to avoid.
//
// This is the *live run* view: query, iterations, tool calls, what Phase 2 got
// to look at, and what it cost. Anything finer-grained belongs in the debug
// dumps (chat_debug_dump.ts), which carry the full prompts without polluting
// the console.

const PREFIX = '[Agent]'
const LABEL_W = 10
const TOOL_W = 20
const RULE_W = 52
/** Ceiling for a tool result line, after its arrays have been collapsed. */
const RESULT_MAX = 320
/** Array elements kept whole in a result preview; the rest becomes a count. */
const ARRAY_HEAD = 1

// ANSI red for the lines that must read as an alarm — warnings, errors and the
// re-collection divider — so a turn that had to backtrack stands out at a glance
// in a console full of green ✅ tool results. Wrapped around the whole line,
// emoji included; a terminal without ANSI just prints the codes' no-ops harmlessly.
const RED = '\x1b[31m'
const RESET = '\x1b[0m'
const red = (s: string): string => `${RED}${s}${RESET}`

/** Every line category, with the icon that identifies it in the console. */
const LABEL_ICONS = {
  query: '💬',
  condensed: '🧭',
  class: '🧩',
  template: '🎯',
  models: '🤖',
  attached: '📎',
  basket: '🧺',
  canvas: '🖼️',
  dump: '📝',
  skipped: '⚡',
  collected: '📥',
  vision: '👀',
  lens: '🎨',
  answering: '💭',
  replay: '⏩',
  retry: '🚨',
  phantom: '👻',
  error: '❌',
  tools: '🧰',
  groups: '📦',
  cost: '💰',
  output: '📤',
} as const

export type AgentLabel = keyof typeof LABEL_ICONS

/** Block divider: `[Agent] 🔍 ━━ PHASE 1 · data collection ━━━━━━━━` */
export function agentSection(icon: string, title: string): void {
  console.log('')
  console.log(`${PREFIX} ${icon} ━━ ${title} ${'━'.repeat(Math.max(3, RULE_W - title.length))}`)
}

/**
 * Block divider for an alarming phase — same shape as `agentSection`, in red and on
 * `console.warn`. Used when Phase 2 rejects the collected data and forces a second
 * pass: the turn backtracked, and the divider says so loudly.
 */
export function agentSectionAlert(icon: string, title: string): void {
  console.warn('')
  console.warn(
    red(`${PREFIX} ${icon} ━━ ${title} ${'━'.repeat(Math.max(3, RULE_W - title.length))}`)
  )
}

export function agentLine(label: AgentLabel, value = ''): void {
  console.log(`${PREFIX} ${LABEL_ICONS[label]} ${label.padEnd(LABEL_W)}${value}`.trimEnd())
}

/** Continuation of the line above: no icon, value stays in its column. */
export function agentSub(value: string): void {
  console.log(`${PREFIX}    ${' '.repeat(LABEL_W)}${value}`)
}

export function agentWarn(label: AgentLabel, value: string): void {
  console.warn(red(`${PREFIX} 🚨 ${label.padEnd(LABEL_W)}${value}`))
}

export function agentError(label: AgentLabel, value: string): void {
  console.error(red(`${PREFIX} ❌ ${label.padEnd(LABEL_W)}${value}`))
}

/** Sub-divider inside phase 1: `[Agent] 🔄 iter 2/4 ┄┄┄┄┄┄┄┄┄┄` */
export function agentIteration(current: number, max: number): void {
  const title = `iter ${current}/${max}`
  console.log(`${PREFIX} 🔄 ${title} ${'┄'.repeat(Math.max(3, RULE_W - title.length))}`)
}

/**
 * A tool call and its result, as a matched pair — same name column, `→` for
 * what went in and `←` for what came back, so the two read as one exchange:
 *
 *   [Agent]    🔧 search_advanced      → {"style_query":"warm golden light…
 *   [Agent]    ✅ search_advanced      ←  1071ms  {"querySummary":{"operation…
 */
export function agentToolCall(name: string, argsJson: string): void {
  // Never truncated. The arguments ARE the call — a clipped one says nothing
  // about what the model actually asked for, which is the whole reason to log it.
  console.log(`${PREFIX}    🔧 ${name.padEnd(TOOL_W)} → ${argsJson.replace(/\s+/g, ' ').trim()}`)
}

export function agentToolResult(name: string, durationMs: number, output: string): void {
  // Tools report failure in-band (they must not throw at the model), so the
  // status icon has to come from the payload.
  const icon = output.includes('"error"') ? '❌' : '✅'
  const ms = `${durationMs}ms`.padStart(7)
  console.log(`${PREFIX}    ${icon} ${name.padEnd(TOOL_W)} ← ${ms}  ${resultPreview(output)}`)
}

/**
 * Result preview that shrinks by STRUCTURE instead of by character count: long
 * strings and the tail of every array collapse, everything else survives whole.
 *
 * A blind slice was cutting mid-`querySummary` — the summary fields are exactly
 * what the line is logged for, and one photo `story` ahead of them was enough to
 * push them out of the window. Collapsing the bulk instead keeps the head of the
 * payload (`querySummary`, `total_sampled`, `error`, …) intact for free.
 */
function resultPreview(output: string): string {
  try {
    return compactPreview(JSON.stringify(collapseForLog(JSON.parse(output))), RESULT_MAX)
  } catch {
    return compactPreview(output, RESULT_MAX) // not JSON — nothing to collapse
  }
}

function collapseForLog(value: any): any {
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 60)}…` : value
  if (Array.isArray(value)) {
    // A short list of scalars (`["documentary","street"]`, `[93223]`) is already
    // its own summary — collapsing it costs more characters than it saves.
    const isShortScalarList =
      value.every((v) => v === null || typeof v !== 'object') && JSON.stringify(value).length <= 60
    if (isShortScalarList) return value
    const head = value.slice(0, ARRAY_HEAD).map((v) => collapseForLog(v))
    return value.length > ARRAY_HEAD ? [...head, `…+${value.length - ARRAY_HEAD} more`] : head
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, collapseForLog(v)]))
  }
  return value
}

/**
 * What Phase 2 actually got to look at, one line per source:
 *
 *   [Agent] 👀 vision    search_advanced      📷  10  📄  10  [34194, 34139, …]
 *
 * 📷 are the photos sent as thumbnails (the curator can judge them); 📄 the
 * ones that arrived as descriptions alone.
 */
export function agentVision(source: string, seen: number, textOnly: number, ids: number[]): void {
  agentLine(
    'vision',
    `${source.padEnd(TOOL_W)} 📷 ${String(seen).padStart(3)}  📄 ${String(textOnly).padStart(3)}  ${formatIds(ids)}`
  )
}

/** `[34194, 34139, 41713, …]` — id lists never grow past a glance. */
export function formatIds(ids: number[], max = 6): string {
  return `[${ids.slice(0, max).join(', ')}${ids.length > max ? ', …' : ''}]`
}

/** Quoted, single-line, ellipsised prose. */
export function quoted(text: string, maxLen: number): string {
  return `"${compactPreview(text, maxLen)}"`
}
