import React, { useCallback, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type NodeMouseHandler,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore, useUiStore, useChatStore, useTabId } from '../../stores/tab-stores'
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

function GraphCanvas() {
  const { nodes, edges } = useGraphStore()
  const { selectedNodeId, selectedProjectPath, setSelectedNode, setSelectedExchange } = useUiStore()
  const { exchanges } = useChatStore()
  const tabId = useTabId()
  const saveTabViewState = useTabsStore(s => s.saveTabViewState)
  const { setViewport, fitView } = useReactFlow()

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
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodesChange={() => {}}
        onEdgesChange={() => {}}
        onMoveEnd={onMoveEnd}
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#27272a" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={n => {
            const d = n.data as { dominantAction?: string }
            const colors: Record<string, string> = {
              read: '#3b82f6', created: '#22c55e', edited: '#eab308',
              deleted: '#ef4444', executed: '#a855f7', searched: '#71717a',
            }
            return colors[d?.dominantAction ?? ''] ?? '#3f3f46'
          }}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: '#18181b', border: '1px solid #3f3f46' }}
        />
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
