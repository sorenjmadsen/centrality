import { create } from 'zustand'
import type { ProjectSettings, GlobalSettings } from '../types/settings'
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../types/settings'
import { applyTheme, getTheme } from '../lib/themes'

interface SettingsStore {
  projectSettings: Record<string, ProjectSettings>
  globalSettings: GlobalSettings

  loadProjectSettings(encodedName: string): Promise<ProjectSettings>
  saveProjectSettings(encodedName: string, settings: ProjectSettings): Promise<void>
  loadGlobalSettings(): Promise<GlobalSettings>
  saveGlobalSettings(settings: GlobalSettings): Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  projectSettings: {},
  globalSettings: DEFAULT_GLOBAL_SETTINGS,

  loadProjectSettings: async (encodedName) => {
    const cached = get().projectSettings[encodedName]
    if (cached) return cached
    const s = await window.api.getProjectSettings(encodedName) as ProjectSettings
    const settings = { ...DEFAULT_PROJECT_SETTINGS, ...s }
    set(state => ({ projectSettings: { ...state.projectSettings, [encodedName]: settings } }))
    return settings
  },

  saveProjectSettings: async (encodedName, settings) => {
    await window.api.setProjectSettings(encodedName, settings)
    set(state => ({ projectSettings: { ...state.projectSettings, [encodedName]: settings } }))
  },

  loadGlobalSettings: async () => {
    const s = await window.api.getGlobalSettings() as GlobalSettings
    const settings = { ...DEFAULT_GLOBAL_SETTINGS, ...s }
    set({ globalSettings: settings })
    applyTheme(getTheme(settings.colorTheme))
    return settings
  },

  saveGlobalSettings: async (settings) => {
    await window.api.setGlobalSettings(settings)
    set({ globalSettings: settings })
    applyTheme(getTheme(settings.colorTheme))
  },
}))
