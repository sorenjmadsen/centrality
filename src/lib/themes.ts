export type ThemeName = 'dark' | 'light' | 'terracotta'

export interface Theme {
  name: ThemeName
  label: string
  /** Primary accent color */
  accent: string
  /** Deeper accent for button backgrounds, active states */
  accentDeep: string
  /** Zinc color scale overrides. undefined = keep Tailwind defaults (dark). */
  zinc?: Partial<Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>>
}

export const THEMES: Theme[] = [
  {
    name: 'dark',
    label: 'Dark',
    accent: '#D97B4A',
    accentDeep: '#BF6435',
    // Uses Tailwind's default zinc scale — no overrides needed
  },
  {
    name: 'light',
    label: 'Light',
    accent: '#D97B4A',
    accentDeep: '#BF6435',
    zinc: {
      '950': '#ffffff',
      '900': '#f4f4f5',
      '800': '#e4e4e7',
      '700': '#d4d4d8',
      '600': '#a1a1aa',
      '500': '#71717a',
      '400': '#52525b',
      '300': '#3f3f46',
      '200': '#27272a',
      '100': '#18181b',
      '50':  '#09090b',
    },
  },
  {
    name: 'terracotta',
    label: 'Terracotta',
    accent: '#D97B4A',
    accentDeep: '#BF6435',
    zinc: {
      '950': '#110C08',
      '900': '#1A1008',
      '800': '#281810',
      '700': '#3D2518',
      '600': '#8A7570',
      '500': '#A89590',
      '400': '#C8B8B4',
      '300': '#DDD0CC',
      '200': '#EDE4E2',
      '100': '#F8F4F4',
      '50':  '#FDFBFB',
    },
  },
]

export const DEFAULT_THEME = THEMES[0]

export function getTheme(name: ThemeName | undefined): Theme {
  return THEMES.find(t => t.name === name) ?? DEFAULT_THEME
}

const ZINC_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.name)
  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-accent-deep', theme.accentDeep)

  // Reset all zinc overrides back to Tailwind defaults
  for (const shade of ZINC_SHADES) {
    root.style.removeProperty(`--color-zinc-${shade}`)
  }

  // Apply theme-specific zinc remapping
  if (theme.zinc) {
    for (const [shade, value] of Object.entries(theme.zinc)) {
      root.style.setProperty(`--color-zinc-${shade}`, value)
    }
  }
}
