interface TokenRate {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export function getRate(model?: string): TokenRate {
  const m = (model ?? '').toLowerCase()
  if (m.includes('opus'))  return { input: 15,  output: 75, cacheRead: 1.5,  cacheWrite: 18.75 }
  if (m.includes('haiku')) return { input: 0.8, output: 4,  cacheRead: 0.08, cacheWrite: 1 }
  return                          { input: 3,   output: 15, cacheRead: 0.3,  cacheWrite: 3.75 }
}

export function computeExchangeCost(
  usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  model?: string
): number {
  const r = getRate(model)
  return (
    usage.input * r.input +
    usage.output * r.output +
    (usage.cacheRead ?? 0) * r.cacheRead +
    (usage.cacheWrite ?? 0) * r.cacheWrite
  ) / 1_000_000
}

// Context window sizes by model family.
// Source: https://docs.anthropic.com/en/docs/about-claude/models/overview
// Update this map when new models are released with different context windows.
const CONTEXT_WINDOW_MAP: Array<[string, number]> = [
  // Claude 1 family: 100k
  ['claude-1',          100_000],
  ['claude-instant-1',  100_000],
  // Claude 2.0: 100k; Claude 2.1: 200k
  ['claude-2.0',        100_000],
  ['claude-2.1',        200_000],
  ['claude-2',          100_000],
  // Claude 3+ (haiku, sonnet, opus, 3.5, 4+): 200k
]

export function getContextWindow(model?: string): number {
  const m = (model ?? '').toLowerCase()
  for (const [prefix, window] of CONTEXT_WINDOW_MAP) {
    if (m.includes(prefix)) return window
  }
  // All claude-3 and newer models default to 200k
  return 200_000
}

// Hex colors for action types — matches ActionBadge.tsx Tailwind classes.
// Using hex so bars can use inline styles (avoids Tailwind purge issues with dynamic class names).
export const ACTION_HEX: Record<string, string> = {
  read:     '#60a5fa', // blue-400
  created:  '#4ade80', // green-400
  edited:   '#facc15', // yellow-400
  deleted:  '#f87171', // red-400
  executed: '#c084fc', // purple-400
  searched: '#a1a1aa', // zinc-400
  spawned:  '#22d3ee', // cyan-400
}

// Hex colors for token type segments in the context bar.
export const TOKEN_HEX = {
  cacheRead:  '#10b981', // emerald-500
  cacheWrite: '#f59e0b', // amber-500
  input:      '#71717a', // zinc-500 (uncached input)
  output:     '#6366f1', // indigo-400 (output — distinct from action colors)
}
