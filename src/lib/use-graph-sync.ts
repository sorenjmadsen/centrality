import { useEffect, useRef } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useChatStore } from '../stores/chat-store'
import { useCodebaseStore } from '../stores/codebase-store'
import { useGraphStore } from '../stores/graph-store'
import { useUiStore } from '../stores/ui-store'
import { useGitStore } from '../stores/git-store'
import { useCompareStore } from '../stores/compare-store'
import { mapActionsToNodes, dominantActionType } from './action-mapper'
import { buildGraphFromNodes } from './graph-layout'
import type { NodeData } from './graph-layout'
import type { ClaudeAction } from '../types/actions'
import type { DepEdge } from '../stores/graph-store'
import type { Node } from '@xyflow/react'

function toRelativeIds(absolutePaths: string[], projectPath: string): Set<string> {
  return new Set(
    absolutePaths.map(p =>
      p.startsWith(projectPath) ? p.slice(projectPath.length).replace(/^\//, '') : p
    )
  )
}

// Builds a nodeId → actions map without cloning the codebaseNodes Map
function buildActionMap(
  actions: ClaudeAction[],
  projectPath: string,
  filter: Set<string>
): Map<string, ClaudeAction[]> {
  const filtered = filter.size > 0 ? actions.filter(a => filter.has(a.type)) : actions
  const map = new Map<string, ClaudeAction[]>()
  for (const action of filtered) {
    if (!action.filePath) continue
    let rel = action.filePath
    if (rel.startsWith(projectPath)) rel = rel.slice(projectPath.length).replace(/^\//, '')
    const existing = map.get(rel)
    if (existing) existing.push(action)
    else map.set(rel, [action])
  }
  return map
}

function applyActionMap(
  nodes: Node[],
  actionsByNode: Map<string, ClaudeAction[]>,
  pulsingIds: Set<string>,
  activeActionsByNode: Map<string, ClaudeAction[]> = new Map()
): Node[] {
  return nodes.map(n => {
    const nodeActions = actionsByNode.get(n.id) ?? []
    const data = n.data as NodeData
    const newPulsing = pulsingIds.has(n.id)
    const newActiveAction = newPulsing ? dominantActionType(activeActionsByNode.get(n.id) ?? []) : null
    // Always create a new node object — never short-circuit on isPulsing or activeAction,
    // since stale truthy values on those fields cause nodes to keep pulsing across exchanges.
    return {
      ...n,
      data: {
        ...data,
        actions: nodeActions,
        dominantAction: dominantActionType(nodeActions),
        activeAction: newActiveAction,
        isPulsing: newPulsing,
      },
    }
  })
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

  // Track playbackIndex in a ref so Effect 1 can read it without depending on it
  const playbackIndexRef = useRef(playbackIndex)
  playbackIndexRef.current = playbackIndex

  // Scan dependency edges when codebase changes
  useEffect(() => {
    if (codebaseNodes.size === 0 || !selectedProjectPath) return
    const filePaths = Array.from(codebaseNodes.keys()).filter(id =>
      codebaseNodes.get(id)?.type === 'file'
    )
    window.api.depScan(selectedProjectPath, filePaths).then(result => {
      setDepEdges(result as DepEdge[])
    }).catch(() => {})
  }, [codebaseNodes, selectedProjectPath])

  // Effect 1: full graph rebuild when structure/base data changes.
  // Does NOT depend on playbackIndex — runs only when the codebase or global
  // action set changes, which is infrequent.
  useEffect(() => {
    if (codebaseNodes.size === 0) return
    const projectPath = selectedProjectPath ?? ''
    const filtered = actionTypeFilter.size > 0
      ? actions.filter(a => actionTypeFilter.has(a.type))
      : actions
    const decorated = mapActionsToNodes(filtered, codebaseNodes, projectPath)
    const { nodes: rfNodes, edges: rfEdges } = buildGraphFromNodes(
      decorated, rootIds, new Set(highlightedFiles), granularity, depEdges, compareNodeIds
    )
    // If playback is active, don't override the playback view — Effect 2 owns it.
    // Effect 2 will re-run on next playbackIndex change and pick up the new structure.
    if (playbackIndexRef.current === null) {
      setGraph(rfNodes, rfEdges)
      setActiveNodeIds(new Set())
    }
  }, [codebaseNodes, actions, depEdges, granularity, compareNodeIds, actionTypeFilter, highlightedFiles, selectedProjectPath, rootIds])

  // Effect 2: fast playback overlay — only updates node data, never rebuilds edges.
  // Runs on every playback step but skips the expensive codebaseNodes clone.
  useEffect(() => {
    const { nodes: rfNodes, edges: rfEdges } = useGraphStore.getState()

    if (playbackIndex === null) {
      // Exiting playback: restore full action view by re-applying the full action map
      if (rfNodes.length === 0) return
      const projectPath = selectedProjectPath ?? ''
      const actionsByNode = buildActionMap(actions, projectPath, actionTypeFilter)
      const combinedPulsing = new Set(highlightedFiles)
      setGraph(applyActionMap(rfNodes, actionsByNode, combinedPulsing), rfEdges)
      setActiveNodeIds(new Set())
      return
    }

    if (rfNodes.length === 0 || exchanges.length === 0) return

    const projectPath = selectedProjectPath ?? ''
    const clampedIndex = Math.min(playbackIndex, exchanges.length - 1)
    const visibleActions = exchanges.slice(0, clampedIndex + 1).flatMap(e => e.actions)
    const actionsByNode = buildActionMap(visibleActions, projectPath, actionTypeFilter)

    const currentExchange = exchanges[clampedIndex]
    const pulsingIds = currentExchange
      ? toRelativeIds(currentExchange.affectedNodes, projectPath)
      : new Set<string>()

    const currentActionsByNode = currentExchange
      ? buildActionMap(currentExchange.actions, projectPath, actionTypeFilter)
      : new Map<string, ClaudeAction[]>()

    const combinedPulsing = new Set<string>(pulsingIds)
    for (const f of highlightedFiles) combinedPulsing.add(f)

    setActiveNodeIds(pulsingIds)
    setGraph(applyActionMap(rfNodes, actionsByNode, combinedPulsing, currentActionsByNode), rfEdges)
  }, [playbackIndex, exchanges, actions, actionTypeFilter, selectedProjectPath, highlightedFiles])
}
