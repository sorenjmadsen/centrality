import { useDirectoryFilterStore } from '../stores/directory-filter-store'
import { useSettingsStore } from '../stores/settings-store'
import type { DirTreeNode } from '../types/codebase'
import type { ProjectSettings } from '../types/settings'

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

    const settings = await useSettingsStore.getState().loadProjectSettings(encodedName)

    try {
      const newPatterns = await useDirectoryFilterStore.getState().promptFilter({
        projectPath,
        encodedName,
        dirTree: countResult.root,
        totalFiles: countResult.totalFiles,
        currentExcludePatterns: settings.excludePatterns,
      })
      await useSettingsStore.getState().saveProjectSettings(encodedName, {
        ...settings,
        excludePatterns: newPatterns,
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
