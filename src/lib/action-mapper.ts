import type { ClaudeAction } from '../types/actions'
import type { CodebaseNode } from '../types/codebase'

// Attach actions to the nodes they touched, by matching filePath to node ids
export function mapActionsToNodes(
  actions: ClaudeAction[],
  nodes: Map<string, CodebaseNode>,
  projectPath: string
): Map<string, CodebaseNode> {
  // Clone nodes so we don't mutate the originals
  const updated = new Map<string, CodebaseNode>()
  for (const [id, node] of nodes) {
    updated.set(id, { ...node, actions: [] })
  }

  for (const action of actions) {
    if (!action.filePath) continue

    // Resolve filePath to a relative path within the project
    let rel = action.filePath
    if (rel.startsWith(projectPath)) {
      rel = rel.slice(projectPath.length).replace(/^\//, '')
    }

    const node = updated.get(rel)
    if (node) {
      node.actions.push(action)
    }
  }

  return updated
}

// Returns the "dominant" action type for a node (most impactful recent action)
const ACTION_PRIORITY: Record<string, number> = {
  deleted: 5,
  created: 4,
  edited: 3,
  executed: 2,
  read: 1,
  searched: 0,
  spawned: 0,
}

export function dominantActionType(actions: ClaudeAction[]): string | null {
  if (actions.length === 0) return null
  return actions.reduce((best, a) =>
    (ACTION_PRIORITY[a.type] ?? 0) > (ACTION_PRIORITY[best.type] ?? 0) ? a : best
  ).type
}
