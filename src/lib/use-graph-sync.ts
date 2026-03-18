import { useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useChatStore } from '../stores/chat-store'
import { useCodebaseStore } from '../stores/codebase-store'
import { useGraphStore } from '../stores/graph-store'
import { useUiStore } from '../stores/ui-store'
import { useGitStore } from '../stores/git-store'
import { useCompareStore } from '../stores/compare-store'
import { mapActionsToNodes } from './action-mapper'
import { buildGraphFromNodes } from './graph-layout'
import type { ClaudeAction } from '../types/actions'
import type { DepEdge } from '../stores/graph-store'

// Converts absolute file paths from affectedNodes to relative node ids
function toRelativeIds(absolutePaths: string[], projectPath: string): Set<string> {
  return new Set(
    absolutePaths.map(p => {
      if (p.startsWith(projectPath)) {
        return p.slice(projectPath.length).replace(/^\//, '')
      }
      return p
    })
  )
}

export function useGraphSync() {
  const { actions } = useSessionStore()
  const { exchanges } = useChatStore()
  const { nodes: codebaseNodes, rootIds } = useCodebaseStore()
  const { setGraph, depEdges, setDepEdges } = useGraphStore()
  const {
    selectedProjectPath,
    playbackIndex,
    actionTypeFilter,
    granularity,
    setActiveNodeIds,
  } = useUiStore()
  const { highlightedFiles } = useGitStore()
  const { compareNodeIds } = useCompareStore()

  // Scan dependency edges when codebase changes
  useEffect(() => {
    if (codebaseNodes.size === 0 || !selectedProjectPath) return
    const filePaths = Array.from(codebaseNodes.keys()).filter(id => {
      const node = codebaseNodes.get(id)
      return node?.type === 'file'
    })
    window.api.depScan(selectedProjectPath, filePaths).then(result => {
      setDepEdges(result as DepEdge[])
    }).catch(() => {
      // silent fail – dep scanning is best-effort
    })
  }, [codebaseNodes, selectedProjectPath])

  useEffect(() => {
    if (codebaseNodes.size === 0) return

    const projectPath = selectedProjectPath ?? ''

    // Determine visible actions and pulsing nodes based on playback state
    let visibleActions: ClaudeAction[]
    let pulsingIds = new Set<string>()

    if (playbackIndex !== null && exchanges.length > 0) {
      const clampedIndex = Math.min(playbackIndex, exchanges.length - 1)
      const visibleExchanges = exchanges.slice(0, clampedIndex + 1)
      visibleActions = visibleExchanges.flatMap(e => e.actions)

      const currentExchange = exchanges[clampedIndex]
      if (currentExchange) {
        pulsingIds = toRelativeIds(currentExchange.affectedNodes, projectPath)
        setActiveNodeIds(pulsingIds)
      }
    } else {
      visibleActions = actions
      setActiveNodeIds(new Set())
    }

    // Apply action type filter
    const filtered = actionTypeFilter.size > 0
      ? visibleActions.filter(a => actionTypeFilter.has(a.type))
      : visibleActions

    // Merge playback pulse with any git-commit highlighted files
    const combinedPulsing = new Set(pulsingIds)
    for (const f of highlightedFiles) combinedPulsing.add(f)

    const decorated = mapActionsToNodes(filtered, codebaseNodes, projectPath)
    const { nodes: rfNodes, edges: rfEdges } = buildGraphFromNodes(
      decorated,
      rootIds,
      combinedPulsing,
      granularity,
      depEdges,
      compareNodeIds
    )
    setGraph(rfNodes, rfEdges)
  }, [codebaseNodes, actions, exchanges, playbackIndex, selectedProjectPath, actionTypeFilter, granularity, highlightedFiles, depEdges, compareNodeIds])
}
