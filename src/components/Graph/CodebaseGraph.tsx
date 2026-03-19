import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  BackgroundVariant,
  useReactFlow,
  useNodes,
  applyNodeChanges,
  type NodeMouseHandler,
  type Viewport,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore, useUiStore, useChatStore, useTabId, useTabStores } from '../../stores/tab-stores'
import { useTabsStore } from '../../stores/tabs-store'
import { DirectoryNode } from './nodes/DirectoryNode'
import { FileNode } from './nodes/FileNode'
import { SymbolNode } from './nodes/SymbolNode'
import { DependencyEdge } from './edges/DependencyEdge'

const nodeTypes = {
  directoryNode: DirectoryNode,
  fileNode: FileNode,
  symbolNode: SymbolNode,
}

const edgeTypes = {
  dependency: DependencyEdge,
}

function positionsKey(sessionPath: string, granularity: string) {
  return `claude-vertex:positions:${sessionPath}:${granularity}`
}

function loadSavedPositions(sessionPath: string, granularity: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(positionsKey(sessionPath, granularity))
    return raw ? (JSON.parse(raw) as Record<string, { x: number; y: number }>) : {}
  } catch { return {} }
}

function savePositions(sessionPath: string, granularity: string, positions: Record<string, { x: number; y: number }>) {
  localStorage.setItem(positionsKey(sessionPath, granularity), JSON.stringify(positions))
}

/** Renders the Claude action trace path inside the minimap SVG (graph coordinate space). */
function MinimapTrace() {
  const rfNodes = useNodes()
  const { exchanges } = useChatStore()
  const { playbackIndex, selectedProjectPath } = useUiStore()

  const tracePoints = useMemo(() => {
    if (rfNodes.length === 0 || exchanges.length === 0) return []

    // Build a map from node id → center position
    const nodeCenter = new Map<string, { x: number; y: number }>()
    for (const n of rfNodes) {
      const w = (n.measured?.width ?? (n.style?.width as number | undefined) ?? 230)
      const h = (n.measured?.height ?? 68)
      nodeCenter.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 })
    }

    const projPath = selectedProjectPath ?? ''
    const visibleExchanges = playbackIndex !== null ? exchanges.slice(0, playbackIndex + 1) : exchanges
    const points: { x: number; y: number }[] = []
    let lastId = ''

    for (const ex of visibleExchanges) {
      for (const filePath of ex.affectedNodes) {
        let relId = filePath
        if (projPath && filePath.startsWith(projPath)) {
          relId = filePath.slice(projPath.length).replace(/^\//, '')
        }
        const center = nodeCenter.get(relId)
        if (center && relId !== lastId) {
          points.push(center)
          lastId = relId
        }
      }
    }
    return points
  }, [rfNodes, exchanges, playbackIndex, selectedProjectPath])

  if (tracePoints.length < 2) return null

  const polylinePoints = tracePoints.map(p => `${p.x},${p.y}`).join(' ')
  const last = tracePoints[tracePoints.length - 1]

  return (
    <>
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="rgba(168, 85, 247, 0.55)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <circle
        cx={last.x}
        cy={last.y}
        r="4"
        fill="rgba(168, 85, 247, 0.9)"
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

function GraphCanvas() {
  const { nodes, edges } = useGraphStore()
  const { selectedNodeId, selectedProjectPath, selectedSessionPath, granularity, activeNodeIds, playbackIndex, setSelectedNode, setSelectedExchange } = useUiStore()
  const { exchanges } = useChatStore()
  const tabId = useTabId()
  const saveTabViewState = useTabsStore(s => s.saveTabViewState)
  const { setViewport, fitView } = useReactFlow()
  const { graph: graphStore } = useTabStores()
  const [isDraggable, setIsDraggable] = useState(false)

  // Restore saved viewport or fit on first mount
  useEffect(() => {
    const saved = useTabsStore.getState().tabViewState[tabId]?.graphViewport
    if (saved) {
      setViewport(saved, { duration: 0 })
    } else {
      fitView({ padding: 0.15 })
    }
  }, [])

  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    saveTabViewState(tabId, { graphViewport: viewport })
  }, [tabId, saveTabViewState])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Apply changes to the graph store (needed for dragging)
    const current = graphStore.getState().nodes
    const updated = applyNodeChanges(changes, current)
    graphStore.setState({ nodes: updated })

    // Persist finished drag positions to localStorage
    if (!selectedSessionPath) return
    const finished = changes.filter(
      (c): c is Extract<NodeChange, { type: 'position'; dragging: boolean }> =>
        c.type === 'position' && (c as { dragging?: boolean }).dragging === false
    )
    if (finished.length > 0) {
      const existing = loadSavedPositions(selectedSessionPath, granularity)
      for (const c of finished) {
        if (c.position) existing[c.id] = c.position
      }
      savePositions(selectedSessionPath, granularity, existing)
    }
  }, [selectedSessionPath, granularity, graphStore])

  const mappedNodes = useMemo(
    () => nodes.map(n => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId]
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const newId = node.id === selectedNodeId ? null : node.id
    setSelectedNode(newId)

    if (newId && selectedProjectPath) {
      const absPath = selectedProjectPath.replace(/\/$/, '') + '/' + newId
      const exchange = exchanges.find(ex =>
        ex.affectedNodes.some(n => n === absPath || n === newId || n.endsWith('/' + newId))
      )
      if (exchange) setSelectedExchange(exchange.id)
    }
  }, [selectedNodeId, selectedProjectPath, exchanges, setSelectedNode, setSelectedExchange])

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={mappedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onEdgesChange={() => {}}
        onMoveEnd={onMoveEnd}
        nodesDraggable={isDraggable}
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#27272a" gap={20} />
        <Controls />
        <Panel position="bottom-left">
          <button
            onClick={() => setIsDraggable(d => !d)}
            className={`flex items-center justify-center w-7 h-7 rounded border transition-colors
              ${isDraggable
                ? 'bg-zinc-700 border-zinc-500 text-zinc-200'
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
              }`}
            title={isDraggable ? 'Lock node positions' : 'Unlock node positions'}
          >
            {isDraggable ? <Unlock size={12} /> : <Lock size={12} />}
          </button>
        </Panel>
        <MiniMap
          nodeColor={n => {
            const d = n.data as { dominantAction?: string; gitPulsing?: boolean }
            const colors: Record<string, string> = {
              read: '#3b82f6', created: '#22c55e', edited: '#eab308',
              deleted: '#ef4444', executed: '#a855f7', searched: '#71717a',
            }
            const baseColor = colors[d?.dominantAction ?? ''] ?? '#3f3f46'

            // When an exchange is active, dim all nodes that aren't involved
            const hasFilter = playbackIndex !== null && activeNodeIds.size > 0
            if (hasFilter) {
              if (activeNodeIds.has(n.id)) return baseColor
              if (d?.gitPulsing) return '#7c3aed'
              return '#27272a'
            }

            if (d?.gitPulsing) return '#7c3aed'
            return baseColor
          }}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: '#18181b', border: '1px solid #3f3f46' }}
        >
          <MinimapTrace />
        </MiniMap>
      </ReactFlow>
    </div>
  )
}

export function CodebaseGraph() {
  const { nodes } = useGraphStore()

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Select a project and session to visualize
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  )
}
