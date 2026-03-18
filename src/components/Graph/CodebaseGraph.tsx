import React, { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../stores/graph-store'
import { useUiStore } from '../../stores/ui-store'
import { useChatStore } from '../../stores/chat-store'
import { DirectoryNode } from './nodes/DirectoryNode'
import { FileNode } from './nodes/FileNode'
import { SymbolNode } from './nodes/SymbolNode'

const nodeTypes = {
  directoryNode: DirectoryNode,
  fileNode: FileNode,
  symbolNode: SymbolNode,
}

export function CodebaseGraph() {
  const { nodes, edges } = useGraphStore()
  const { selectedNodeId, selectedProjectPath, setSelectedNode, setSelectedExchange } = useUiStore()
  const { exchanges } = useChatStore()

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const newId = node.id === selectedNodeId ? null : node.id
    setSelectedNode(newId)

    if (newId && selectedProjectPath) {
      // Find the first exchange that touched this node
      const absPath = selectedProjectPath.replace(/\/$/, '') + '/' + newId
      const exchange = exchanges.find(ex =>
        ex.affectedNodes.some(n => n === absPath || n === newId || n.endsWith('/' + newId))
      )
      if (exchange) setSelectedExchange(exchange.id)
    }
  }, [selectedNodeId, selectedProjectPath, exchanges, setSelectedNode, setSelectedExchange])

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Select a project and session to visualize
      </div>
    )
  }

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodesChange={() => {}}
        onEdgesChange={() => {}}
        fitView
        fitViewOptions={{ padding: 0.15 }}
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
