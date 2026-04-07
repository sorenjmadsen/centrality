import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { ProjectSettings, GlobalSettings } from '../../src/types/settings'
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../src/types/settings'

const BASE_DIR = path.join(os.homedir(), '.centrality')
const PROJECTS_DIR = path.join(BASE_DIR, 'projects')
const GLOBAL_PATH = path.join(BASE_DIR, 'config.json')

function readJson<T>(filePath: string, defaults: T): T {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

export function getProjectSettings(encodedName: string): ProjectSettings {
  return readJson(path.join(PROJECTS_DIR, `${encodedName}.json`), DEFAULT_PROJECT_SETTINGS)
}

export function setProjectSettings(encodedName: string, settings: ProjectSettings): void {
  writeJson(path.join(PROJECTS_DIR, `${encodedName}.json`), settings)
}

export function getGlobalSettings(): GlobalSettings {
  return readJson(GLOBAL_PATH, DEFAULT_GLOBAL_SETTINGS)
}

export function setGlobalSettings(settings: GlobalSettings): void {
  writeJson(GLOBAL_PATH, settings)
}
