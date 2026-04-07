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
  // Claude 4.6 models: 1M context window
  ['claude-sonnet-4-6', 1_000_000],
  ['claude-opus-4-6',   1_000_000],
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

/** Rough token estimate from character count (≈4 chars/token for English/code). */
export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / 4)
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

// Hex colors for the 7 attribution categories.
export const ATTRIBUTION_HEX = {
  claudeMd:     '#f472b6',  // pink-400
  skills:       '#34d399',  // emerald-400
  atMentions:   '#fb923c',  // orange-400
  toolIO:       '#60a5fa',  // blue-400
  thinking:     '#a78bfa',  // violet-400
  teamOverhead: '#52525b',  // zinc-600
  userText:     '#71717a',  // zinc-500
}

export const ATTRIBUTION_LABELS: Record<keyof typeof ATTRIBUTION_HEX, string> = {
  claudeMd:     'System',
  skills:       'Skills',
  atMentions:   '@-files',
  toolIO:       'Tool I/O',
  thinking:     'Thinking',
  teamOverhead: 'History',
  userText:     'User text',
}

// Hex colors for token type segments in the context bar.
export const TOKEN_HEX = {
  cacheRead:  '#10b981', // emerald-500
  cacheWrite: '#f59e0b', // amber-500
  input:      '#71717a', // zinc-500 (uncached input)
  output:     '#6366f1', // indigo-400 (output — distinct from action colors)
}
