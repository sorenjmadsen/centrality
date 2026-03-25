export type ThemeName = 'dark' | 'forest' | 'midnight' | 'ocean' | 'ember'

export interface Theme {
  name: ThemeName
  label: string
  /** Primary accent — replaces blue-500 */
  accent: string
  /** Deeper accent — replaces blue-600 (button backgrounds, etc.) */
  accentDeep: string
}

export const THEMES: Theme[] = [
  { name: 'dark',     label: 'Dark',     accent: '#3b82f6', accentDeep: '#2563eb' },
  { name: 'forest',   label: 'Forest',   accent: '#10b981', accentDeep: '#059669' },
  { name: 'midnight', label: 'Midnight', accent: '#8b5cf6', accentDeep: '#7c3aed' },
  { name: 'ocean',    label: 'Ocean',    accent: '#06b6d4', accentDeep: '#0891b2' },
  { name: 'ember',    label: 'Ember',    accent: '#f59e0b', accentDeep: '#d97706' },
]

export const DEFAULT_THEME = THEMES[0]

export function getTheme(name: ThemeName | undefined): Theme {
  return THEMES.find(t => t.name === name) ?? DEFAULT_THEME
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-accent-deep', theme.accentDeep)
}
