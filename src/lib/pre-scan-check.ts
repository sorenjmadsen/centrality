import { useDirectoryFilterStore } from '../stores/directory-filter-store'
import { useSettingsStore } from '../stores/settings-store'
import type { DirTreeNode } from '../types/codebase'

const FILE_COUNT_THRESHOLD = 5000

/**
 * Counts files in a project directory and, if the count exceeds the threshold,
 * opens the directory filter dialog so the user can choose which directories
 * to include.  Saves updated excludePatterns to project settings on disk.
 *
 * Returns `'continue'` if the scan should proceed, or `'cancelled'` if the
 * user dismissed the dialog.
 */
export async function preScanCheck(
  projectPath: string,
  encodedName: string,
): Promise<'continue' | 'cancelled'> {
  try {
    const countResult = await window.api.countDirectoryTree(projectPath) as {
      root: DirTreeNode
      totalFiles: number
    }

    if (countResult.totalFiles <= FILE_COUNT_THRESHOLD) return 'continue'

    const globalSettings = useSettingsStore.getState().globalSettings
    const projectSettings = await useSettingsStore.getState().loadProjectSettings(encodedName)
    const combinedPatterns = [...globalSettings.defaultExcludePatterns, ...projectSettings.excludePatterns]

    try {
      const newPatterns = await useDirectoryFilterStore.getState().promptFilter({
        projectPath,
        encodedName,
        dirTree: countResult.root,
        totalFiles: countResult.totalFiles,
        currentExcludePatterns: combinedPatterns,
      })
      // Only save project-specific patterns (exclude global defaults)
      const globalSet = new Set(globalSettings.defaultExcludePatterns)
      const projectOnlyPatterns = newPatterns.filter(p => !globalSet.has(p))
      await useSettingsStore.getState().saveProjectSettings(encodedName, {
        ...projectSettings,
        excludePatterns: projectOnlyPatterns,
      })
      return 'continue'
    } catch {
      // User cancelled
      return 'cancelled'
    }
  } catch {
    // Count failed — proceed with scan anyway
    return 'continue'
  }
}
