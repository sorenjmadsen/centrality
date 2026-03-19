import { useEffect, useRef } from 'react'
import { useTabCacheStore } from '../stores/tab-cache-store'
import {
  useSessionStore,
  useChatStore,
  useCodebaseStore,
  useGraphStore,
  useUiStore,
  useGitStore,
  useCompareStore,
  useTabStores,
} from '../stores/tab-stores'
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
    selectedSessionPath,
    playbackIndex,
    actionTypeFilter,
    granularity,
    setActiveNodeIds,
  } = useUiStore()
  const { highlightedFiles } = useGitStore()
  const { compareNodeIds } = useCompareStore()

  // Raw store instances for imperative getState()/setState() calls inside effects
  const { codebase: codebaseStore, graph: graphStore, chat: chatStore } = useTabStores()

  // Track playbackIndex in a ref so Effect 1 can read it without depending on it
  const playbackIndexRef = useRef(playbackIndex)
  playbackIndexRef.current = playbackIndex

  // Scan dependency edges when codebase changes (skip if restored from cache)
  useEffect(() => {
    if (codebaseNodes.size === 0 || !selectedProjectPath) return
    if (codebaseStore.getState().restoredFromCache) return
    const filePaths = Array.from(codebaseNodes.keys()).filter(id =>
      codebaseNodes.get(id)?.type === 'file'
    )
    window.api.depScan(selectedProjectPath, filePaths).then(result => {
      const edges = result as DepEdge[]
      setDepEdges(edges)
      const sessionPath = selectedSessionPath
      if (sessionPath) useTabCacheStore.getState().patch(sessionPath, { depEdges: edges })
    }).catch(() => {})
  }, [codebaseNodes, selectedProjectPath])

  // Effect 1: full graph rebuild when structure/base data changes.
  // Does NOT depend on playbackIndex — runs only when the codebase or global
  // action set changes, which is infrequent.
  useEffect(() => {
    if (codebaseNodes.size === 0) return

    // Skip rebuild if this render cycle is a cache restore — the graph store
    // already has the correct layout. Clear the flag so future changes rebuild normally.
    if (codebaseStore.getState().restoredFromCache) {
      codebaseStore.setState({ restoredFromCache: false })
      return
    }

    const projectPath = selectedProjectPath ?? ''
    const filtered = actionTypeFilter.size > 0
      ? actions.filter(a => actionTypeFilter.has(a.type))
      : actions
    const decorated = mapActionsToNodes(filtered, codebaseNodes, projectPath)
    const { nodes: rfNodes, edges: rfEdges } = buildGraphFromNodes(
      decorated, rootIds, new Set(highlightedFiles), granularity, depEdges, compareNodeIds
    )

    const currentPlayback = playbackIndexRef.current
    if (currentPlayback === null) {
      // No playback — set graph directly
      setGraph(rfNodes, rfEdges)
      setActiveNodeIds(new Set())
    } else {
      // Playback active — rebuild structure with new granularity, then re-apply
      // the playback overlay so we don't flash the full-actions view.
      const currentExchanges = chatStore.getState().exchanges
      if (currentExchanges.length > 0) {
        const clampedIndex = Math.min(currentPlayback, currentExchanges.length - 1)
        const visibleActions = currentExchanges.slice(0, clampedIndex + 1).flatMap(e => e.actions)
        const actionsByNode = buildActionMap(visibleActions, projectPath, actionTypeFilter)
        const currentExchange = currentExchanges[clampedIndex]
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
      } else {
        setGraph(rfNodes, rfEdges)
        setActiveNodeIds(new Set())
      }
    }

    if (selectedSessionPath && currentPlayback === null) {
      useTabCacheStore.getState().patch(selectedSessionPath, {
        graphNodes: rfNodes,
        graphEdges: rfEdges,
      })
    }
  }, [codebaseNodes, actions, depEdges, granularity, compareNodeIds, actionTypeFilter, highlightedFiles, selectedProjectPath, rootIds])

  // Effect 2: fast playback overlay — only updates node data, never rebuilds edges.
  // Runs on every playback step but skips the expensive codebaseNodes clone.
  useEffect(() => {
    const { nodes: rfNodes, edges: rfEdges } = graphStore.getState()

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
